import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { storeInboxReading, inboxData, dealData, syncMessage } from './inbox-store';
import type { Judgment } from '../ai/structured';
import { assessReplies } from './inbox-model';
import { dealActions } from './deal-model';
test('同一消息重抓不重复商单，回复变化自动退出待回复；问题同步幂等', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'inbox-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    let calls = 0;
    const judgment = {
      read: async (_schema: unknown, _prompt: string) => {
        calls++;
        return {
          items: [
            {
              key: calls === 1 ? '1' : '2',
              classification: { category: calls === 1 ? 'deal' : 'idea', reason: '原文明确请求' },
              brand: null,
              requirement: '合作',
            },
          ],
        };
      },
    } as unknown as Judgment;
    const raw = {
      key: '1',
      author: '甲',
      body: '合作咨询',
      sentAt: '2026-10-17T00:00:00Z',
      contentTitle: null,
      reply: {
        kind: 'dm' as const,
        conversationId: 'one',
        latestConfirmed: true,
        lastSender: 'other' as const,
        lastMessageAt: '2026-10-17T00:00:00Z',
      },
      context: [],
      contextComplete: true,
    };
    const reading = { messages: [raw], complete: true, reason: null };
    await storeInboxReading(db, 'douyin', 'dm', 'https://www.douyin.com/', reading, judgment);
    const first = inboxData(db).items[0];
    expect(dealData(db).items).toHaveLength(1);
    expect(assessReplies([first]).get(first.id)?.state).toBe('waiting');
    const uncertain = {
      ...first,
      reply: {
        ...first.reply,
        kind: 'dm' as const,
        conversationId: 'one',
        latestConfirmed: false,
        lastSender: 'other' as const,
        lastMessageAt: null,
      },
    };
    expect(dealActions(dealData(db).items, [uncertain], assessReplies([uncertain]))).toHaveLength(1);

    await storeInboxReading(
      db,
      'douyin',
      'dm',
      'https://www.douyin.com/',
      { ...reading, messages: [{ ...raw, reply: { ...raw.reply, lastSender: 'self' } }] },
      judgment,
    );
    expect(calls).toBe(1);
    expect(dealData(db).items).toHaveLength(1);
    expect(assessReplies(inboxData(db).items).get(first.id)?.state).toBe('replied');
    await storeInboxReading(
      db,
      'douyin',
      'dm',
      'https://www.douyin.com/',
      { ...reading, messages: [{ ...raw, key: '2', body: '如何学习？' }] },
      judgment,
    );
    const idea = inboxData(db).items.find((m) => m.body === '如何学习？')!;
    const saved = syncMessage(db, idea.id, idea.revision);
    expect(syncMessage(db, saved.id, saved.revision).topicSignalId).toBe(saved.topicSignalId);
    expect(() => syncMessage(db, saved.id, idea.revision)).toThrow('已更新');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
