import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { requireAttention, pendingAttention, resolveAttention } from './attention';
import { checkConfirmations } from './confirmations';
import { confirmationDeadline } from '../browser/policy';
import { EgoBrowser } from '../browser/ego';
test('微信确认按北京时间23点到期，成功前不继续，超时写真实失败且不可再次恢复', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'attention-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    const deadline = confirmationDeadline('23:00', new Date('2026-10-17T14:00:00Z'));
    expect(deadline).toBe('2026-10-17T15:00:00.000Z');
    const input = {
      platformId: 'channels',
      kind: 'confirmation' as const,
      reason: '请在微信里确认登录',
      deadline,
      spaceId: 14,
      page: 'p1',
    };
    const id = requireAttention(db, input);
    expect(requireAttention(db, input)).toBe(id);
    expect(pendingAttention(db)).toHaveLength(1);
    let continued = 0;
    const browser = new EgoBrowser(process.cwd(), async () => ({
      url: 'https://channels.weixin.qq.com/',
      positive: [],
      negative: ['登录视频号助手'],
    }));
    await checkConfirmations(
      db,
      async () => {
        continued++;
      },
      browser,
      '2026-10-17T14:59:59.000Z',
    );
    expect(continued).toBe(0);
    await checkConfirmations(
      db,
      async () => {
        continued++;
      },
      browser,
      deadline,
    );
    expect(continued).toBe(0);
    expect(pendingAttention(db)).toHaveLength(0);
    expect(db.sqlite.prepare('SELECT status,reason FROM crawl_logs').get()).toEqual({
      status: 'failed',
      reason: '未确认登录',
    });
    requireAttention(db, { ...input, platformId: 'douyin', kind: 'risk', reason: '验证码' });
    resolveAttention(db, 'douyin');
    expect(pendingAttention(db)).toHaveLength(0);
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
