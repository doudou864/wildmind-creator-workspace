import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { readState, writeState } from '../collectors/state';
import { dailySchedule, dueSlot, loadSchedule } from './schedule';

test('下午采集前不运行，失败顺延重试，迟醒不会连补三轮', async () => {
  const cfg = await loadSchedule();
  expect([cfg.start, cfg.end, cfg.retries]).toEqual(['14:30', '14:40', ['15:00', '15:30']]);
  expect(dueSlot(new Date('2026-10-25T14:29:00+08:00'), 875, cfg.retries, [], false)).toBeNull();
  expect(dueSlot(new Date('2026-10-25T14:40:00+08:00'), 875, cfg.retries, [], false)).toBe('main');
  expect(dueSlot(new Date('2026-10-25T15:01:00+08:00'), 875, cfg.retries, ['main'], false)).toBe('15:00');
  expect(dueSlot(new Date('2026-10-25T16:00:00+08:00'), 875, cfg.retries, [], false)).toBe('15:30');
  expect(dueSlot(new Date('2026-10-25T16:00:00+08:00'), 875, cfg.retries, ['15:30'], false)).toBeNull();
});

test('同日各平台共享一次随机选择，改窗口保留旧成功与尝试记录', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'fixture-schedule-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    const key = 'schedule:2026-10-25';
    writeState(db, key, { chosen: 635, attempted: ['main', '11:00'], successfulPlatforms: ['douyin'] });
    const chosen = dailySchedule(db, '2026-10-25', '14:30', '14:40');
    expect(chosen).toBeGreaterThanOrEqual(870);
    expect(chosen).toBeLessThanOrEqual(880);
    expect(dailySchedule(db, '2026-10-25', '14:30', '14:40')).toBe(chosen);
    expect(readState(db, key)).toEqual({ chosen, attempted: ['main', '11:00'], successfulPlatforms: ['douyin'] });
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('视频号仅手动触发，定时只可续接已发起的微信确认，不能启动新一轮', async () => {
  const { scheduledPlatforms } = await import('./schedule');
  const cfg = await loadSchedule();
  expect(cfg.manualOnly).toEqual(['channels']);
  expect(scheduledPlatforms(cfg.platforms, cfg.manualOnly, [])).not.toContain('channels');
  expect(scheduledPlatforms(cfg.platforms, cfg.manualOnly, ['channels'])).toContain('channels');
  expect(scheduledPlatforms(cfg.platforms, cfg.manualOnly, [])).toEqual([
    'douyin',
    'bilibili',
    'youtube',
    'xiaohongshu',
  ]);
  expect(cfg.platforms).toContain('channels');
});
