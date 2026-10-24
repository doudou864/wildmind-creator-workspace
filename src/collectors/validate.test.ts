import { expect, test } from 'vitest';
import { loadConfig } from '../lib/config';
import { requireCoreMetrics, missingDailyPostMetrics } from './validate';
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

test('新视频列表换成平均播放占比时要补读日指标；明确未知值不触发反复补采', async () => {
  const cfg = await loadConfig();
  const post = {
    key: 'fixture-new',
    title: '测试新片',
    publishedAt: '2026-10-23T22:00:00+08:00',
    form: '视频' as const,
  };
  const capture: CapturedReading = {
    sourcePath: 'data/fixture/list.png',
    capturedAt: '2026-10-24T06:35:00Z',
    kind: 'list',
    reading: {
      status: 'ok',
      reason: null,
      posts: [
        {
          ...post,
          metrics: [
            { label: '播放量', raw: '10' },
            { label: '平均播放占比', raw: '6%' },
          ],
        },
      ],
      account: { dataDate: null, metrics: [] },
      records: [],
      signals: [],
    },
  };
  expect(missingDailyPostMetrics(cfg, 'douyin', post, [capture], {}).map((m) => m.name)).toEqual(['2秒跳出率']);
  const other = structuredClone(capture);
  other.reading.posts[0].title = '另一条测试作品';
  other.reading.posts[0].metrics.push({ label: '2秒跳出率', raw: '40%' });
  expect(missingDailyPostMetrics(cfg, 'douyin', post, [capture, other], {})).toHaveLength(1);
  capture.reading.posts[0].metrics.push({ label: '2s跳出率', raw: null });
  expect(missingDailyPostMetrics(cfg, 'douyin', post, [capture], { '2s跳出率': '2秒跳出率' })).toEqual([]);
});
