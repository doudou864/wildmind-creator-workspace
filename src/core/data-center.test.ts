import { test, expect } from 'vitest';
import { quantile } from './statistics';
import { dailySample, comparison, type AnalysisPost, type AnalysisMetric } from './data-center';
import type { ReviewSample } from './review';
const post = (id: string, date = '2026-10-01T10:00:00+08:00', form = '视频'): AnalysisPost => ({
  id,
  title: id,
  platformId: 'douyin',
  form,
  publishedAt: date,
  metricId: 'views',
  fire: false,
});
const sample = (id: string, postId: string, day: number, value: number | null, metricId = 'views'): ReviewSample => ({
  id,
  postId,
  metricId,
  capturedAt: new Date(
    Date.parse(postId === 'target' ? '2026-10-10T10:00:00+08:00' : '2026-10-01T10:00:00+08:00') + day * 86400000,
  ).toISOString(),
  value,
  backfillKind: 'none',
});
const target = post('target', '2026-10-10T10:00:00+08:00');
const peers = Array.from({ length: 5 }, (_, i) => post('p' + i));
const metric: AnalysisMetric = { id: 'views', name: '播放量', unit: '次', direction: 'higher', normalization: 'raw' };
const options = { minimum: 5, limit: 20, per: 1000 };
const now = Date.parse('2026-10-20');
test('共享分位数中位数保持旧算法，P25/P75线性插值；空集为空', () => {
  expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
  expect(quantile([4, 1, 3, 2], 0.25)).toBe(1.75);
  expect(quantile([], 0.5)).toBeNull();
});
test('实际天龄曲线不把D8填进D7，空值不是零，满24小时才D1', () => {
  const rows = [sample('a', 'target', 8, 80), sample('b', 'target', 7, null), sample('zero', 'target', 1, 0)];
  expect(dailySample(target, rows, 7, now)).toBeUndefined();
  expect(dailySample(target, rows, 8, now)?.value).toBe(80);
  expect(dailySample(target, rows, 1, now)?.value).toBe(0);
  expect(dailySample(target, [{ ...rows[2], capturedAt: '2026-10-11T09:59:59+08:00' }], 1, now)).toBeUndefined();
});
test('检查点后补与对比池同规则，排除自己、晚发、不同形式平台；不足隐藏范围', () => {
  const rows = [sample('t', 'target', 8, 90), ...peers.map((p, i) => sample(p.id, p.id, 8, (i + 1) * 10))];
  const excluded = [
    post('later', '2026-10-11T10:00:00+08:00'),
    post('image', undefined, '图文'),
    { ...post('other'), platformId: 'other' },
  ];
  rows.push(
    ...excluded.map((p) => ({
      ...sample(p.id, p.id, 8, 99999),
      capturedAt: new Date(Date.parse(p.publishedAt) + 8 * 86400000).toISOString(),
    })),
  );
  const result = comparison(target, [target, ...peers, ...excluded], rows, metric, 7, now, options);
  expect(result).toMatchObject({ value: 90, median: 30, p25: 20, p75: 40, count: 5, conclusion: '偏高', actualDay: 8 });
  expect(result.peerBackfills).toHaveLength(5);
  expect(comparison(target, [target, ...peers.slice(0, 4)], rows, metric, 7, now, options)).toMatchObject({
    median: null,
    p25: null,
    p75: null,
    count: 4,
    conclusion: null,
    status: 'insufficient',
  });
});
test('越小越好反转结论，边界正常；每千播放必须配同次采集的分母，缺失或0不能算', () => {
  const rows = [sample('t', 'target', 7, 10), ...peers.map((p, i) => sample(p.id, p.id, 7, (i + 1) * 10))];
  expect(
    comparison(target, [target, ...peers], rows, { ...metric, direction: 'lower' }, 7, now, options).conclusion,
  ).toBe('偏高');
  expect(
    comparison(target, [target, ...peers], [{ ...rows[0], value: 20 }, ...rows.slice(1)], metric, 7, now, options)
      .conclusion,
  ).toBe('正常');
  const likes = [sample('l', 'target', 7, 1, 'likes'), ...peers.map((p) => sample('l' + p.id, p.id, 7, 1, 'likes'))];
  const m = { ...metric, id: 'likes', normalization: 'per_view' as const };
  expect(comparison(target, [target, ...peers], [...rows, ...likes], m, 7, now, options).value).toBe(100);
  expect(comparison(target, [target, ...peers], likes, m, 7, now, options).value).toBeNull();
  expect(
    comparison(target, [target, ...peers], [{ ...rows[0], value: 0 }, ...likes], m, 7, now, options).value,
  ).toBeNull();
});
