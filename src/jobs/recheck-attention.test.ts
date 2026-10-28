import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { requireAttention, pendingAttention } from './attention';
import { recheckLoginAttention } from './recheck-attention';
import type { LoginResult } from '../browser/interface';
test('旧验证码按现页复核：用户控制或未知不解除，确定登录后只清除对应记录', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fixture-recheck-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    requireAttention(db, {
      platformId: 'xiaohongshu',
      kind: 'risk',
      reason: '需要处理：验证码',
      spaceId: 11,
      page: 'p1',
    });
    requireAttention(db, { platformId: 'channels', kind: 'risk', reason: '浏览器操作超时', spaceId: 5, page: 'p1' });
    let state: LoginResult['state'] = 'unknown';
    const browser = {
      observeLogin: async () => ({
        state,
        statePath: null,
        reason: 'fixture',
        platformId: 'xiaohongshu',
        checkedAt: new Date().toISOString(),
      }),
    };
    expect(await recheckLoginAttention(db, 'xiaohongshu', browser)).toEqual([]);
    expect(pendingAttention(db)).toHaveLength(2);
    state = 'logged_in';
    expect(await recheckLoginAttention(db, 'xiaohongshu', browser)).toEqual([{ spaceId: 11, page: 'p1' }]);
    expect(pendingAttention(db).map((item) => item.platformId)).toEqual(['channels']);
    expect(await recheckLoginAttention(db, 'channels', browser)).toEqual([]);
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
