import { test, expect } from 'vitest';
import { playbackDistribution, type AnalysisPost } from './data-center';
import type { ReviewSample } from './review';
const options = { timeZone: 'Asia/Shanghai', axisPadding: 1000 };
const post = (id: string): AnalysisPost => ({
  id,
  title: id,
  platformId: 'douyin',
  form: '视频',
  publishedAt: '2026-10-01T23:55:00+08:00',
  metricId: 'views',
  fire: null,
});
const sample = (id: string, capturedAt: string, value: number | null, postId = 'a'): ReviewSample => ({
  id,
  postId,
  metricId: 'views',
  capturedAt,
  value,
  backfillKind: 'none',
});
const now = Date.parse('2026-11-02T00:00:00+08:00');
test('发布当天D0；北京时间跨午夜即D1，同日以最后完成采样覆盖，不受24小时和UTC日期影响', () => {
  const result = playbackDistribution(
    'douyin',
    [post('a')],
    [
      sample('d0', '2026-10-01T23:59:00+08:00', 9000),
      sample('missing', '2026-10-02T00:00:00+08:00', null),
      sample('first', '2026-10-01T16:05:00Z', 2000),
      sample('later', '2026-10-02T23:59:00+08:00', 3000),
    ],
    1,
    now,
    options,
  );
  expect(result.rows[0].value).toBe(3000);
  expect(result).toMatchObject({ count: 1, median: 3000, min: 2000, max: 4000 });
});
test('独立抖音统计包含视频图文，排除其他平台；缺失不补抓、不补零，真实0参与中位数', () => {
  const all = [
    post('a'),
    post('b'),
    post('c'),
    { ...post('image'), form: '图文' },
    { ...post('other'), platformId: 'other' },
  ];
  const rows = [
    sample('a', '2026-10-04T12:00:00+08:00', 0),
    sample('b', '2026-10-04T12:00:00+08:00', 4000, 'b'),
    sample('c', '2026-10-05T12:00:00+08:00', 99999, 'c'),
    sample('image', '2026-10-04T12:00:00+08:00', 99999, 'image'),
  ];
  const result = playbackDistribution('douyin', all, rows, 3, now, options);
  expect(result.rows.map((r) => r.value)).toEqual([0, 4000, null, 99999]);
  expect(result).toMatchObject({ count: 3, median: 4000, min: -1000, max: 100999 });
});
test('D7和D30严格选对应日，未来记录不提前展示；全空不产生中位线或虚构坐标', () => {
  const rows = [sample('d7', '2026-10-08T00:01:00+08:00', 7000), sample('d30', '2026-10-31T00:01:00+08:00', 30000)];
  expect(playbackDistribution('douyin', [post('a')], rows, 7, now, options).median).toBe(7000);
  expect(playbackDistribution('douyin', [post('a')], rows, 30, now, options).median).toBe(30000);
  expect(playbackDistribution('douyin', [post('a')], rows, 30, Date.parse('2026-10-30'), options)).toMatchObject({
    count: 0,
    median: null,
    min: null,
    max: null,
  });
});
