import { test, expect, vi } from 'vitest';
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  writeFile: vi.fn(),
}));
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../../db/database';
import { collectChannelsComments } from './inbox';
import { inboxData } from '../../lib/inbox-store';
import type { CollectionSession } from '../../browser/collection-session';
import type { Judgment } from '../../ai/structured';

test('仅开起号日后作品，排除本人和旧消息，同文不同作品不会合并，回复证据来自原页', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T10:00:00+08:00'));
  const folder = await mkdtemp(path.join(tmpdir(), 'channels-inbox-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  const opened: string[] = [];
  let current = '';
  const session = {
    navigate: async () => {},
    inspect: async () => {},
    capture: async () => {},
    scrollShadow: async () => {},
    clickShadow: async (_h: string, _s: string, title: string) => {
      current = title;
      opened.push(title);
    },
    run: async (script: string) => {
      if (script.includes('rows:Array.from(root.querySelectorAll(cfg.feed))'))
        return {
          rows: [
            { title: '甲', date: '2026/10/14 09:12' },
            { title: '乙', date: '2026/10/13 09:12' },
            { title: '旧作', date: '2025/10/14 09:12' },
          ],
          bottom: false,
        };
      if (script.includes('direction:')) return { visible: true, direction: 1 };
      return {
        rows: [
          {
            author: '观众',
            body: '值得看',
            time: '2026/10/17 10:30',
            self: false,
            ownReply: true,
            nested: false,
            more: false,
          },
          {
            author: '我',
            body: '谢谢',
            time: '2026/10/17 10:31',
            self: true,
            ownReply: false,
            nested: true,
            more: false,
          },
          {
            author: '旧消息',
            body: '旧',
            time: '2026/09/16 09:00',
            self: false,
            ownReply: false,
            nested: false,
            more: false,
          },
        ],
        bottom: true,
        moreText: null,
      };
    },
  } as unknown as CollectionSession;
  const judgment = {
    read: async () => ({
      items: [
        {
          key: 'scoped:' + JSON.stringify([current, '观众', '2026/10/17 10:30', '值得看']),
          classification: { category: 'other', reason: '普通评论' },
          brand: null,
          requirement: null,
        },
      ],
    }),
  } as unknown as Judgment;
  try {
    const paths: string[] = [];
    const result = await collectChannelsComments(db, session, judgment, paths);
    expect(opened).toEqual(['甲', '乙']);
    expect(result.complete).toBe(true);
    expect(inboxData(db).items).toHaveLength(2);
    expect(inboxData(db).items.every((m) => m.reply.kind === 'comment' && m.reply.ownReplyFound)).toBe(true);
  } finally {
    vi.useRealTimers();
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
