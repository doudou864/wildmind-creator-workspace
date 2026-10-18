import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { initializeDatabase } from '../../db/database';
import type { CollectionSession } from '../../browser/collection-session';
import type { Judgment } from '../../ai/structured';
import { collectYoutubeInbox } from './inbox';
import { inboxData } from '../../lib/inbox-store';
import { replyState } from '../../lib/inbox-model';
test('评论列表稳定到尾才完成，排除本人评论，无回复可判待回复，私信无入口不伪造零条', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'youtube-inbox-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    let screens = 0;
    const session = {
      navigate: async () => {},
      inspect: async () => {},
      click: async () => {},
      capture: async () => {},
      scroll: async () => {},
      run: async (s: string) => {
        if (s.includes("querySelectorAll('button')")) return [];
        if (s.includes('role=dialog')) return false;
        screens++;
        return {
          bottom: true,
          text: '评论',
          rows: [
            { id: 'viewer', author: '观众', body: '谢谢', time: '2026-10-14', title: '作品', replies: '0 条回复' },
            {
              id: 'self',
              author: '@摆烂的逗逗',
              body: '我的补充',
              time: '2026-10-14',
              title: '作品',
              replies: '0 条回复',
            },
          ],
        };
      },
    } as unknown as CollectionSession;
    const judgment = {
      read: async (_schema: unknown, prompt: string, images?: string[]) =>
        images?.length
          ? {
              items: JSON.parse(prompt.split('\n').at(-1)!).map((r: { key: string }) => ({
                key: r.key,
                likes: null,
                replyCount: null,
              })),
            }
          : {
              items: [
                {
                  key: '0',
                  classification: { category: 'other', reason: '普通感谢' },
                  brand: null,
                  requirement: null,
                },
              ],
            },
    } as unknown as Judgment;
    expect(await collectYoutubeInbox(db, session, judgment, [])).toEqual({ messages: 1, complete: true });
    expect(screens).toBe(2);
    const data = inboxData(db);
    expect(data.items).toHaveLength(1);
    expect(replyState(data.items[0])).toBe('waiting');
    expect(data.sources.find((s) => s.channel === 'dm')?.status).toBe('unavailable');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
