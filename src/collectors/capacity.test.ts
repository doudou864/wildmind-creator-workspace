import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { checkCapacity } from './capacity';
import { requireAttention, resolveAttention, pendingAttention } from '../jobs/attention';
import { showData } from '../jobs/data-show';
import { loadConfig } from '../lib/config';
test('接近上限提前提醒且不覆盖登录；成功采集不清掉容量提醒，降至阈值以下才解除', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'capacity-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    const cfg = { warnAt: 8, maxRecentWorks: 10, maxPages: 100 };
    requireAttention(db, { platformId: 'youtube', kind: 'login', reason: '登录失效' });
    checkCapacity(db, 'youtube', 8, cfg);
    expect(
      pendingAttention(db)
        .map((x) => x.kind)
        .sort(),
    ).toEqual(['capacity', 'login']);
    expect(showData(db, await loadConfig(), 'youtube')).toContain('近期作品已有8条');
    resolveAttention(db, 'youtube');
    expect(pendingAttention(db).map((x) => x.kind)).toEqual(['capacity']);
    checkCapacity(db, 'youtube', 10, cfg);
    expect(pendingAttention(db)).toHaveLength(1);
    expect(() => checkCapacity(db, 'youtube', 11, cfg)).toThrow('超过配置上限');
    checkCapacity(db, 'youtube', 7, cfg);
    expect(pendingAttention(db)).toHaveLength(0);
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
