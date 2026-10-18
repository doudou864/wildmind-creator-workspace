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
        expect(_prompt).toContain('投资、孵化');
        expect(JSON.parse(_prompt.split('\n').at(-1)!)[0].key).toBe('0');
        return {
          items: [
            {
              key: '0',
              classification: { category: calls === 1 ? 'deal' : 'idea', reason: '原文明确请求' },
              brand: null,
              requirement: '合作',
            },
          ],
        };
      },
    } as unknown as Judgment;
    const raw = {
      key: 'native:' + '带引号和表情的长编号😀'.repeat(100),
      author: '甲',
      body: '我们提供项目投资和孵化支持，邀请商务合作',
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

test('同一主题内不重复计数，允许一条多问题消息关联不同主题，不能遗漏本轮消息', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'inbox-themes-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const { refreshThemes } = await import('./inbox-store');
    const classifier = {
      read: async () => ({
        items: ['0', '1'].map((key) => ({
          key,
          classification: { category: 'idea', reason: '问题' },
          brand: null,
          requirement: null,
        })),
      }),
    } as unknown as Judgment;
    await storeInboxReading(
      db,
      'douyin',
      'comment',
      'https://www.douyin.com/',
      {
        messages: ['one', 'two'].map((key) => ({
          key,
          author: key,
          body: key + ' 如何使用？',
          sentAt: '2026-10-18T00:00:00Z',
          contentTitle: null,
          reply: { kind: 'comment' as const, ownReplyFound: null, repliesComplete: false },
          context: [],
          contextComplete: false,
        })),
        complete: true,
        reason: null,
      },
      classifier,
    );
    const ids = ['0', '1'];
    const duplicate = {
      read: async () => ({
        themes: [{ existingId: null, title: '主题', summary: '说明', messageIds: [ids[0], ids[0]] }],
      }),
    } as unknown as Judgment;
    await expect(refreshThemes(db, duplicate)).rejects.toThrow('遗漏消息');
    expect(inboxData(db).themes).toHaveLength(0);
    const missing = {
      read: async () => ({ themes: [{ existingId: null, title: '主题', summary: '说明', messageIds: [ids[0]] }] }),
    } as unknown as Judgment;
    await expect(refreshThemes(db, missing)).rejects.toThrow('遗漏消息');
    const valid = {
      read: async () => ({
        themes: [
          { existingId: null, title: '主题', summary: '说明', messageIds: ids },
          { existingId: null, title: '另一个问题', summary: '说明', messageIds: ids },
        ],
      }),
    } as unknown as Judgment;
    await refreshThemes(db, valid);
    expect(inboxData(db).themes).toHaveLength(2);
    expect(inboxData(db).themes[0].messageIds).toHaveLength(2);
    expect(new Set(inboxData(db).themes[0].messageIds)).toEqual(new Set(inboxData(db).items.map((m) => m.id)));
    expect(inboxData(db).themes[0].messageIds).not.toContain('0');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
