import { test, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../../db/database';
import { collectChannelsDM } from './inbox-dm';
import { inboxData } from '../../lib/inbox-store';
import { replyState } from '../../lib/inbox-model';
import type { CollectionSession } from '../../browser/collection-session';
import type { Judgment } from '../../ai/structured';
test('末条以会话时间核对，未标日期的历史不进入AI；自己后来回复会退出待回复', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-18T10:00:00+08:00'));
  const folder = await mkdtemp(path.join(tmpdir(), 'channels-dm-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  let self = false,
    calls = 0;
  const clicked: string[] = [];
  const session = {
    navigate: async () => {},
    inspect: async () => {},
    capture: async () => {},
    scrollShadow: async () => {},
    clickShadow: async (_h: string, _s: string, text: string) => {
      clicked.push(text);
    },
    run: async (script: string) => {
      if (script.includes('rows:Array.from(root.querySelectorAll(cfg.contact))'))
        return {
          rows: [
            { name: '近期', time: '10月17日 14:31', preview: '新消息' },
            { name: '旧人', time: '2025年10月17日 14:31', preview: '旧' },
          ],
          bottom: true,
        };
      if (script.includes('direction:')) return { visible: true, direction: 1 };
      return {
        rows: [
          { body: '没有日期的历史不可用于分类', self: false },
          { body: '新消息', self },
        ],
        bottom: true,
      };
    },
  } as unknown as CollectionSession;
  const judgment = {
    read: async (_schema: unknown, prompt: string) => {
      calls++;
      expect(prompt).not.toContain('没有日期的历史');
      return {
        items: [
          {
            key: 'scoped:' + JSON.stringify(['近期', '2026-10-17T14:31:00+08:00', '新消息']),
            classification: { category: 'other', reason: '普通消息' },
            brand: null,
            requirement: null,
          },
        ],
      };
    },
  } as unknown as Judgment;
  try {
    const result = await collectChannelsDM(db, session, judgment, []);
    expect(result.complete).toBe(false);
    expect(clicked).not.toContain('旧人');
    expect(inboxData(db).items).toHaveLength(1);
    expect(replyState(inboxData(db).items[0])).toBe('waiting');
    expect(inboxData(db).items[0].context).toEqual([]);
    expect(calls).toBe(1);
    self = true;
    await collectChannelsDM(db, session, judgment, []);
    expect(replyState(inboxData(db).items[0])).toBe('replied');
    expect(calls).toBe(1);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
    vi.useRealTimers();
  }
});
