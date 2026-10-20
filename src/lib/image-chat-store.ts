import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database';
import { contents, assets, imageChats, imageChatTurns, imageGenerations } from '../db/schema';
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
    contentId: z.string().min(1),
    text: z.string().min(1).max(20000),
    referenceIds: z.array(z.string()).max(3),
    purposeId: z.string(),
  })
  .strict();
export async function runImageChat(
  db: WorkspaceDatabase,
  raw: unknown,
  onText: (text: string) => void,
  transport: ChatTransport = streamImageChat,
) {
  const input = chatInput.parse(raw),
    content = db.db.select().from(contents).where(eq(contents.id, input.contentId)).get();
  if (!content) throw Error('请先选择作品');
  const old = db.db.select().from(imageChatTurns).where(eq(imageChatTurns.id, input.id)).get();
  if (old) {
    if (
      old.contentId !== input.contentId ||
      old.input !== input.text ||
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
      tx.insert(imageChatTurns)
        .values({
          id: input.id,
          contentId: input.contentId,
          input: input.text,
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
          fixture: content.fixture,
          kind: 'chat',
          usageDate: shanghaiDate(),
          status: 'running',
          startedAt,
          calls: 1,
        })
        .run();
    });
    begun = true;
    const chat = db.db.select().from(imageChats).where(eq(imageChats.contentId, input.contentId)).get();
    const thread = (id: string) => {
      db.db
        .insert(imageChats)
        .values({ contentId: input.contentId, threadId: id, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: imageChats.contentId,
          set: { threadId: id, updatedAt: new Date().toISOString() },
        })
        .run();
      db.db.update(imageGenerations).set({ threadId: id }).where(eq(imageGenerations.id, usageId)).run();
    };
    const result = await transport({
      text: input.text,
      references,
      threadId: chat?.threadId ?? null,
      config,
      onThread: thread,
      onText: (text) => {
        db.db
          .update(imageChatTurns)
          .set({ output: text, updatedAt: new Date().toISOString() })
          .where(eq(imageChatTurns.id, input.id))
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
          title: `${content.title} · 对话配图`.slice(0, 200),
          purposeId: input.purposeId,
          topicId: content.topicId,
          contentId: content.id,
          prompt: input.text,
          parentAssetId: null,
        },
        new Uint8Array(await readFile(file)),
      );
      db.db.update(assets).set({ source: 'ai', fixture: content.fixture }).where(eq(assets.id, a.id)).run();
      assetIds.push(a.id);
      db.db
        .update(imageChatTurns)
        .set({ assetIds: [...assetIds], updatedAt: new Date().toISOString() })
        .where(eq(imageChatTurns.id, input.id))
        .run();
    }
    const now = new Date().toISOString();
    db.db
      .update(imageChatTurns)
      .set({ output: result.text, status: 'success', assetIds, updatedAt: now })
      .where(eq(imageChatTurns.id, input.id))
      .run();
    db.db
      .update(imageGenerations)
      .set({ status: 'success', finishedAt: now, durationMs: Date.parse(now) - Date.parse(startedAt) })
      .where(eq(imageGenerations.id, usageId))
      .run();
    return db.db.select().from(imageChatTurns).where(eq(imageChatTurns.id, input.id)).get()!;
  } catch (e) {
    if (begun) {
      const error = e instanceof Error ? e.message : String(e),
        now = new Date().toISOString();
      db.db
        .update(imageChatTurns)
        .set({ error, status: 'failed', updatedAt: now })
        .where(eq(imageChatTurns.id, input.id))
        .run();
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
