import { expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { initializeDatabase } from '../db/database';
import { startCrawl, finishCrawl } from './crawl-log';
import { dashboardData } from '../lib/dashboard-store';
import { loadConfig } from '../lib/config';
import { collectorHealth } from './collector-health';

test('数据等待持久化为成功，页面保留平台日期，不报警也不新增虚构数据；下次恢复清除提示', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'fixture-data-pending-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig();
    const id = startCrawl(db, 'youtube', '2026-10-24T07:00:00Z');
    await finishCrawl(
      db,
      id,
      { status: 'success', dataPending: { through: '2026-10-22', note: 'fixture平台尚未更新' } },
      '2026-10-24T07:01:00Z',
    );
    const now = new Date('2026-10-24T08:00:00Z');
    const result = dashboardData(db, config, now).platforms.youtube;
    expect(result).toMatchObject({
      status: 'success',
      lastSuccess: '2026-10-24T07:01:00Z',
      error: null,
      dataPending: { through: '2026-10-22' },
      days: [],
      works: [],
    });
    expect(collectorHealth(db, [{ id: 'youtube', name: 'YouTube' }], now)).toEqual([]);
    const next = startCrawl(db, 'youtube', '2026-10-24T07:30:00Z');
    await finishCrawl(db, next, { status: 'success' }, '2026-10-24T07:31:00Z');
    expect(dashboardData(db, config, now).platforms.youtube.dataPending).toBeUndefined();
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
