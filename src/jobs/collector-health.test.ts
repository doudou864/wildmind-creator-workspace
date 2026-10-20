import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { crawlLogs } from '../db/schema';
import { collectorHealth, notifyCollectorHealth } from './collector-health';
test('failure and more than 24h stale data warn; unchanged conditions notify only once without launching macOS notifications', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'u9-health-fixture-')),
    db = await initializeDatabase(path.join(folder, 'db'));
  try {
    db.db
      .insert(crawlLogs)
      .values({
        id: 'fixture-success',
        platformId: 'douyin',
        status: 'success',
        startedAt: '2026-10-18T00:00:00Z',
        finishedAt: '2026-10-18T01:00:00Z',
        archivePaths: [],
        updatedAt: 'fixture',
      })
      .run();
    const platforms = [{ id: 'douyin', name: '抖音' }];
    expect(collectorHealth(db, platforms, new Date('2026-10-19T01:00:00Z'))).toHaveLength(0);
    expect(collectorHealth(db, platforms, new Date('2026-10-19T01:00:01Z'))[0].reason).toContain('超过 1 天');
    db.db
      .insert(crawlLogs)
      .values({
        id: 'fixture-failure',
        platformId: 'douyin',
        status: 'failed',
        startedAt: '2026-10-20T00:00:00Z',
        finishedAt: '2026-10-20T00:01:00Z',
        reason: 'fixture failure',
        archivePaths: [],
        updatedAt: 'fixture',
      })
      .run();
    expect(
      collectorHealth(db, platforms, new Date('2026-10-20T01:00:00Z')).some((w) =>
        w.reason.includes('fixture failure'),
      ),
    ).toBe(true);
    let sent = 0;
    const notify = async () => {
      sent++;
      return { stdout: '', stderr: '' };
    };
    await notifyCollectorHealth(db, notify);
    await notifyCollectorHealth(db, notify);
    expect(sent).toBe(1);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
