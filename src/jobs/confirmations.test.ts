import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { checkConfirmations } from './confirmations';
import { requireAttention, pendingAttention, expireConfirmations } from './attention';
import type { EgoBrowser } from '../browser/ego';
test('截止时间后先看真实登录页面：已登录但采集失败，不能误记为未确认登录', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'confirm-login-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    requireAttention(db, {
      platformId: 'channels',
      kind: 'confirmation',
      reason: '请在微信确认',
      deadline: '2026-10-18T15:00:00Z',
      spaceId: 19,
      page: 'p1',
    });
    const browser = { observeLogin: async () => ({ state: 'logged_in' }) } as unknown as EgoBrowser;
    await expect(
      checkConfirmations(
        db,
        async () => {
          throw Error('采集网络失败');
        },
        browser,
        '2026-10-18T16:00:00Z',
      ),
    ).rejects.toThrow('采集网络失败');
    expect(pendingAttention(db)).toHaveLength(0);
    expect(expireConfirmations(db, '2026-10-18T16:00:00Z')).toHaveLength(0);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
