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

test('用户在微信确认后自动继续一次，处理完成移出清单', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'confirmation-ready-'));
  const database = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    requireAttention(database, {
      platformId: 'channels',
      kind: 'confirmation',
      reason: '请在微信里确认登录',
      deadline: '2026-10-17T15:00:00.000Z',
      spaceId: 14,
      page: 'p1',
    });
    let continued = 0;
    const browser = new EgoBrowser(process.cwd(), async () => ({
      url: 'https://channels.weixin.qq.com/platform',
      positive: ['视频号ID:', '关注者', '昨日数据'],
      negative: [],
    }));
    const resume = async () => {
      continued++;
    };
    await checkConfirmations(database, resume, browser, '2026-10-17T14:00:00.000Z');
    await checkConfirmations(database, resume, browser, '2026-10-17T14:01:00.000Z');
    expect(continued).toBe(1);
    expect(pendingAttention(database)).toHaveLength(0);
  } finally {
    database.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('已关闭的微信登录页结束旧等待，不能永久挡住重新采集', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fixture-closed-confirmation-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    requireAttention(db, {
      platformId: 'channels',
      kind: 'confirmation',
      reason: '等待微信',
      deadline: '2026-10-24T15:00:00Z',
      spaceId: 57,
      page: 'p1',
    });
    const browser = new EgoBrowser(process.cwd(), async () => ({
      url: 'https://channels.weixin.qq.com/',
      positive: [],
      negative: [],
      unavailable: '登录页面已关闭，请重新启动该平台采集',
      pageAvailability: 'closed',
    }));
    let continued = 0;
    for (let i = 0; i < 2; i++)
      await checkConfirmations(
        db,
        async () => {
          continued++;
        },
        browser,
        '2026-10-24T07:00:00Z',
      );
    expect(continued).toBe(0);
    expect(pendingAttention(db)).toEqual([]);
    expect(db.sqlite.prepare('SELECT status,reason FROM crawl_logs').all()).toEqual([
      { status: 'failed', reason: '登录页面已关闭，请重新启动该平台采集' },
    ]);
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
