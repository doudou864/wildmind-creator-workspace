import { resolveImageChatSkill } from './image-chat-skills';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database';
import {
  contents,
  assets,
  imageChats,
  imageChatTurns,
  imageGenerations,
  imageStudioChats,
  imageStudioTurns,
} from '../db/schema';
import { streamImageChat, type ChatTransport } from '../ai/image-chat';
import { loadGenerationConfig } from '../ai/image-generation';
import { loadImageConfig } from './image-config';
import { assetFile } from './image-files';
import { usedImages, uploadImage } from './media-store';
import { shanghaiDate } from '../browser/policy';
import { acquireJobLock } from '../jobs/lock';
export const chatInput = z
  .object({
    id: z.string().uuid(),
    contentId: z.string().min(1).nullable().default(null),
    sessionId: z.string().uuid().optional(),
    skillId: z.string().nullable().default(null),
    text: z.string().min(1).max(20000),
    referenceIds: z.array(z.string()).max(3),
    purposeId: z.string(),
  })
  .strict()
  .refine((v) => Boolean(v.contentId) !== Boolean(v.sessionId), '请选择作品或独立对话');
export async function runImageChat(
  db: WorkspaceDatabase,
  raw: unknown,
  onText: (text: string) => void,
  transport: ChatTransport = streamImageChat,
) {
  const input = chatInput.parse(raw);
  const content = input.contentId ? db.db.select().from(contents).where(eq(contents.id, input.contentId)).get() : null;
  if (input.contentId && !content) throw Error('作品不存在');
  const conversationId = input.sessionId ?? input.contentId!;
  const turns = input.sessionId ? imageStudioTurns : imageChatTurns;
  const chats = input.sessionId ? imageStudioChats : imageChats;
  const skill = await resolveImageChatSkill(input.skillId);
  const old = db.db.select().from(turns).where(eq(turns.id, input.id)).get();
  if (old) {
    if (
      old.contentId !== conversationId ||
      old.input !== input.text ||
      ('skillId' in old && (old.skillId !== input.skillId || old.purposeId !== input.purposeId)) ||
      JSON.stringify(old.referenceIds) !== JSON.stringify(input.referenceIds)
    )
      throw Error('请求编号已用于其他对话');
    return old;
  }
  const config = await loadGenerationConfig(),
    imageConfig = await loadImageConfig();
  if (!imageConfig.purposes.some((p) => p.id === input.purposeId && p.contentMode !== 'upload'))
    throw Error('请选择图片用途');
  const references = await Promise.all(
    input.referenceIds.map(async (id) => {
      const asset = db.db.select().from(assets).where(eq(assets.id, id)).get();
      if (!asset) throw Error('参考图不存在');
      return assetFile(asset.path);
    }),
  );
  const release = await acquireJobLock(path.join(path.dirname(db.filename), 'jobs/image-generation.pid'));
  if (!release) throw Error('已有生图或对话正在运行');
  const startedAt = new Date().toISOString(),
    usageId = randomUUID();
  let begun = false;
  try {
    if (usedImages(db, shanghaiDate()) >= config.dailyLimit) throw Error('今天已达到每日上限');
    db.db.transaction((tx) => {
      tx.insert(turns)
        .values({
          id: input.id,
          contentId: conversationId,
          input: input.text,
          ...(input.sessionId
            ? { skillId: skill?.id ?? null, skillName: skill?.name ?? null, purposeId: input.purposeId }
            : {}),
          referenceIds: input.referenceIds,
          output: '',
          status: 'running',
          assetIds: [],
          createdAt: startedAt,
          updatedAt: startedAt,
        })
        .run();
      tx.insert(imageGenerations)
        .values({
          id: usageId,
          fixture: content?.fixture ?? false,
          kind: 'chat',
          usageDate: shanghaiDate(),
          status: 'running',
          startedAt,
          calls: 1,
        })
        .run();
    });
    begun = true;
    const chat = db.db.select().from(chats).where(eq(chats.contentId, conversationId)).get();
    const thread = (id: string) => {
      db.db
        .insert(chats)
        .values({ contentId: conversationId, threadId: id, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: chats.contentId,
          set: { threadId: id, updatedAt: new Date().toISOString() },
        })
        .run();
      db.db.update(imageGenerations).set({ threadId: id }).where(eq(imageGenerations.id, usageId)).run();
    };
    const result = await transport({
      text: input.text,
      skill,
      standalone: !!input.sessionId,
      references,
      threadId: chat?.threadId ?? null,
      config,
      onThread: thread,
      onText: (text) => {
        db.db
          .update(turns)
          .set({ output: text, updatedAt: new Date().toISOString() })
          .where(eq(turns.id, input.id))
          .run();
        onText(text);
      },
    });
    thread(result.threadId);
    const assetIds: string[] = [];
    for (const file of result.files) {
      const a = await uploadImage(
        db,
        {
          title: `${content?.title ?? '封面对话'} · 对话配图`.slice(0, 200),
          purposeId: input.purposeId,
          topicId: content?.topicId ?? null,
          contentId: content?.id ?? null,
          prompt: input.text,
          parentAssetId: null,
        },
        new Uint8Array(await readFile(file)),
      );
      db.db
        .update(assets)
        .set({ source: 'ai', fixture: content?.fixture ?? false })
        .where(eq(assets.id, a.id))
        .run();
      assetIds.push(a.id);
      db.db
        .update(turns)
        .set({ assetIds: [...assetIds], updatedAt: new Date().toISOString() })
        .where(eq(turns.id, input.id))
        .run();
    }
    const now = new Date().toISOString();
    db.db
      .update(turns)
      .set({ output: result.text, status: 'success', assetIds, updatedAt: now })
      .where(eq(turns.id, input.id))
      .run();
    db.db
      .update(imageGenerations)
      .set({ status: 'success', finishedAt: now, durationMs: Date.parse(now) - Date.parse(startedAt) })
      .where(eq(imageGenerations.id, usageId))
      .run();
    return db.db.select().from(turns).where(eq(turns.id, input.id)).get()!;
  } catch (e) {
    if (begun) {
      const error = e instanceof Error ? e.message : String(e),
        now = new Date().toISOString();
      db.db.update(turns).set({ error, status: 'failed', updatedAt: now }).where(eq(turns.id, input.id)).run();
      db.db
        .update(imageGenerations)
        .set({ reason: error, status: 'failed', finishedAt: now, durationMs: Date.parse(now) - Date.parse(startedAt) })
        .where(eq(imageGenerations.id, usageId))
        .run();
    }
    throw e;
  } finally {
    await release();
  }
}

export async function recoverStoppedStudioChats(db: WorkspaceDatabase) {
  if (!db.db.select().from(imageStudioTurns).where(eq(imageStudioTurns.status, 'running')).get()) return;
  const release = await acquireJobLock(path.join(path.dirname(db.filename), 'jobs/image-generation.pid'));
  if (!release) return;
  try {
    const now = new Date().toISOString();
    const error = '上次对话进程已停止；已返回的图片保留，请检查结果后再发送。';
    db.db
      .update(imageStudioTurns)
      .set({ status: 'failed', error, updatedAt: now })
      .where(eq(imageStudioTurns.status, 'running'))
      .run();
    db.db
      .update(imageGenerations)
      .set({ status: 'failed', reason: error, finishedAt: now })
      .where(and(eq(imageGenerations.status, 'running'), eq(imageGenerations.kind, 'chat')))
      .run();
  } finally {
    await release();
  }
}
