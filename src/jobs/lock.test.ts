import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireJobLock } from './lock';
test('同一时刻只能有一个采集任务，释放后才能继续', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'crawl-lock-'));
  const file = path.join(dir, 'lock');
  try {
    const release = await acquireJobLock(file);
    expect(release).not.toBeNull();
    expect(await acquireJobLock(file)).toBeNull();
    await release!();
    const next = await acquireJobLock(file);
    expect(next).not.toBeNull();
    await next!();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
