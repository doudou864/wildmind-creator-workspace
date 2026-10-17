import { expect, test } from 'vitest';
import { loadConfig } from '../lib/config';
import { requireCoreMetrics } from './validate';
import type { CapturedReading } from './storage';
test('识别成功不等于数据完整；缺核心指标必须失败，显示未知值可保留null', async () => {
  const cfg = await loadConfig();
  const post = { key: 'p', title: '测试', publishedAt: '2026-10-14T00:00:00+08:00', form: '视频' as const };
  const definitions = cfg.metrics.filter((m) =>
    m.bindings.some((b) => b.platformId === 'bilibili' && b.level === 'core'),
  );
  const reading: CapturedReading = {
    sourcePath: 'data/test.csv',
    capturedAt: '2026-10-17T00:00:00Z',
    kind: 'list',
    reading: {
      status: 'ok',
      reason: null,
      posts: [
        { ...post, metrics: definitions.filter((m) => m.scope === 'post').map((m) => ({ label: m.name, raw: null })) },
      ],
      account: {
        dataDate: '2026-10-16',
        metrics: definitions.filter((m) => m.scope === 'account').map((m) => ({ label: m.name, raw: '0' })),
      },
      records: [],
      signals: [],
    },
  };
  expect(() => requireCoreMetrics(cfg, 'bilibili', [post], [reading], {}, {})).not.toThrow();
  reading.reading.posts[0].metrics = [];
  expect(() => requireCoreMetrics(cfg, 'bilibili', [post], [reading], {}, {})).toThrow('核心指标缺失');
});
