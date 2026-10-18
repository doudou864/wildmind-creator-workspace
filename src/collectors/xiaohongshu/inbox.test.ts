import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../../db/database';
import type { CollectionSession } from '../../browser/collection-session';
import type { Judgment } from '../../ai/structured';
import { collectXiaohongshuDM } from './inbox';
import { replyState } from '../../lib/inbox-model';
import { inboxData, dealData } from '../../lib/inbox-store';
test('只打开近期会话，旧消息不进入分类上下文，原生消息编号重抓不重复商单', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'xhs-inbox-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    let replied = false;
    const clicks: string[] = [];
    const prompts: string[] = [];
    const session = {
      navigate: async () => {},
      inspect: async () => {},
      click: async (s: string) => {
        clicks.push(s);
      },
      capture: async () => {},
      archiveSnapshot: async () => {},
      scroll: async () => {},
      run: async (s: string) =>
        s.includes('cfg.listScroll')
          ? {
              rows: [
                { name: '近期合作', time: '2026年10月14日' },
                { name: '旧联系人', time: '2026年7月15日' },
              ],
              bottom: false,
            }
          : {
              rows: [
                { id: 'old', body: '旧消息', time: '2026年9月16日 12:00', self: false },
                { id: 'new', body: '合作邀约', time: '2026年10月14日 11:41', self: false },
                ...(replied ? [{ id: 'self', body: '收到', time: '2026年10月14日 12:00', self: true }] : []),
              ],
              top: true,
              bottom: true,
            },
    } as unknown as CollectionSession;
    const judgment = {
      read: async (_schema: unknown, prompt: string) => {
        prompts.push(prompt);
        return {
          items: [
            {
              key: '0',
              classification: { category: 'deal', reason: '明确合作邀约' },
              brand: null,
              requirement: '合作',
            },
          ],
        };
      },
    } as unknown as Judgment;
    await collectXiaohongshuDM(db, session, judgment, []);
    await collectXiaohongshuDM(db, session, judgment, []);
    expect(clicks.every((s) => s.includes('近期合作'))).toBe(true);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).not.toContain('旧消息');
    expect(inboxData(db).items).toHaveLength(1);
    expect(dealData(db).items).toHaveLength(1);
    expect(inboxData(db).items[0].context.map((r) => r.id)).toEqual(['new']);
    expect(replyState(inboxData(db).items[0])).toBe('waiting');
    replied = true;
    await collectXiaohongshuDM(db, session, judgment, []);
    expect(replyState(inboxData(db).items[0])).toBe('replied');
    expect(prompts).toHaveLength(1);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
