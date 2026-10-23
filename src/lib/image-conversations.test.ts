import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { initializeDatabase } from '../db/database';
import { imageStudioChats, imageStudioTurns, contents } from '../db/schema';
import { readImageConversations, manageImageConversation } from './image-conversations';
import { runImageChat } from './image-chat-store';
import { imageChatMessages } from '../ai/image-chat';

test('历史兼容无标题旧会话与失败孤立轮次；改名归档恢复只修改会话，不删除历史和线程', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'image-history-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'db'));
  try {
    const id = randomUUID(),
      orphan = randomUUID();
    db.db.insert(imageStudioChats).values({ contentId: id, threadId: 'fixture-thread', updatedAt: '2026-01-01' }).run();
    const turn = (session: string, input: string) => ({
      id: randomUUID(),
      contentId: session,
      input,
      purposeId: 'video_cover',
      referenceIds: [],
      output: '',
      status: 'failed' as const,
      error: 'fixture interruption',
      assetIds: ['fixture-original-image'],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    });
    db.db
      .insert(imageStudioTurns)
      .values([turn(id, '  旧主题\n保持原文 '), turn(orphan, '孤立失败对话')])
      .run();
    expect(readImageConversations(db).map((s) => s.title)).toEqual(expect.arrayContaining(['旧主题', '孤立失败对话']));
    const before = db.db.select().from(imageStudioTurns).all();
    manageImageConversation(db, { action: 'rename', id, title: '我的封面' });
    manageImageConversation(db, { action: 'archive', id });
    expect(readImageConversations(db).find((s) => s.id === id)).toMatchObject({ title: '我的封面', archived: true });
    await expect(
      runImageChat(
        db,
        { id: randomUUID(), sessionId: id, text: 'fixture', purposeId: 'free', referenceIds: [] },
        () => {},
        async () => {
          throw Error('不得调用模型');
        },
      ),
    ).rejects.toThrow('恢复');
    manageImageConversation(db, { action: 'restore', id });
    manageImageConversation(db, { action: 'create', id });
    expect(db.db.select().from(imageStudioChats).where(eq(imageStudioChats.contentId, id)).get()).toMatchObject({
      threadId: 'fixture-thread',
      title: '我的封面',
      archived: false,
    });
    manageImageConversation(db, { action: 'archive', id: orphan });
    expect(readImageConversations(db).find((s) => s.id === orphan)?.archived).toBe(true);
    expect(db.db.select().from(imageStudioTurns).all()).toEqual(before);
    expect(db.db.select().from(contents).all()).toEqual([]);
    db.db.update(imageStudioTurns).set({ status: 'running' }).where(eq(imageStudioTurns.contentId, id)).run();
    expect(() => manageImageConversation(db, { action: 'archive', id })).toThrow('仍在生成');
    expect(() => manageImageConversation(db, { action: 'rename', id: randomUUID(), title: 'missing' })).toThrow(
      '不存在',
    );
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('比例快捷设置独立传给Codex，续聊隔离线程且不能用同一请求偷换比例', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'image-ratio-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'db'));
  try {
    const a = randomUUID(),
      b = randomUUID();
    const input = {
      id: randomUUID(),
      sessionId: a,
      text: '  原文\n不要修改  ',
      purposeId: 'free',
      referenceIds: [],
      ratio: '16:9',
    };
    const transport = async (call: Parameters<NonNullable<Parameters<typeof runImageChat>[3]>>[0]) => {
      expect(call.ratio).toBe('16:9');
      expect(call.text).toBe(input.text);
      const messages = imageChatMessages(call);
      expect(messages.at(-1)?.text).toBe(input.text);
      expect(messages.some((m) => m.text.includes('比例快捷选项中选择：16:9'))).toBe(true);
      return { threadId: 'fixture-a', text: 'fixture', files: [] };
    };
    await runImageChat(db, input, () => {}, transport);
    expect(db.db.select().from(imageStudioTurns).all()[0].ratio).toBe('16:9');
    await expect(runImageChat(db, { ...input, ratio: '3:4' }, () => {}, transport)).rejects.toThrow('请求编号');
    await expect(runImageChat(db, { ...input, id: randomUUID(), ratio: '2:7' }, () => {}, transport)).rejects.toThrow(
      '有效的图片比例',
    );
    await runImageChat(
      db,
      { ...input, sessionId: b, id: randomUUID(), ratio: '' },
      () => {},
      async (call) => {
        expect(call.threadId).toBeNull();
        return { threadId: 'fixture-b', text: 'fixture B', files: [] };
      },
    );
    await runImageChat(
      db,
      { ...input, id: randomUUID() },
      () => {},
      async (call) => {
        expect(call.threadId).toBe('fixture-a');
        return transport(call);
      },
    );
    expect(readImageConversations(db)).toHaveLength(2);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
