import { test, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { consumePage } from './policy';
test('并行浏览器共享每日额度，不丢计数也不因短暂锁竞争失败', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'fixture-budget-'));
  try {
    await mkdir(path.join(root, 'config'));
    await writeFile(
      path.join(root, 'config/collection.yaml'),
      'browser:\n  actionDelayMs: [1, 1]\n  platformDelayMs: [1, 1]\n  dwellMs: [1, 1]\n  scrollPixels: [1, 1]\n  dailyPageLimit: 5\n  riskMarkers: [验证码]\n  confirmationPollSeconds: 30\n',
    );
    await Promise.all(Array.from({ length: 5 }, () => consumePage(root)));
    expect(JSON.parse(await readFile(path.join(root, 'data/browser/usage.json'), 'utf8')).count).toBe(5);
    await expect(consumePage(root)).rejects.toThrow('每天页面数上限');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
