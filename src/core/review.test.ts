import { test, expect } from 'vitest';
import {
  reviewCheckpoint,
  firstSample,
  trend,
  hitRates,
  firstPublications,
  type ReviewPost,
  type ReviewSample,
  type FrozenPoint,
} from './review';
const options = { baselineSamples: 20, baselineMinimum: 5, hitThreshold: 1.5 };
const post = (id: string, extra: Partial<ReviewPost> = {}): ReviewPost => ({
  id,
  platformId: 'douyin',
  form: '视频',
  metricId: 'views',
  publishedAt: '2026-09-01',
  topicId: id,
  automatic: false,
  fire: false,
  ...extra,
});
const sample = (id: string, value: number | null, extra: Partial<ReviewSample> = {}): ReviewSample => ({
  id,
  postId: id,
  metricId: 'views',
  capturedAt: '2026-09-04T00:00:00+08:00',
  value,
  backfillKind: 'none',
  ...extra,
});
const target = post('target');
const peers = Array.from({ length: 5 }, (_, i) => post(String(i)));
const samples = peers.map((p, i) => sample(p.id, (i + 1) * 10));
const now = Date.parse('2026-09-05T00:00:00+08:00');
test('同龄基线排除自身、其他平台、形式、指标和未来数据，中位数不受目标大值影响', () => {
  const excluded = [
    post('platform', { platformId: 'other' }),
    post('form', { form: '图文' }),
    post('metric', { metricId: 'stars' }),
    post('future'),
  ];
  const point = reviewCheckpoint(
    target,
    [target, ...peers, ...excluded],
    [
      ...samples,
      sample('target', 300),
      ...excluded.map((p) =>
        sample(p.id, 9999, {
          metricId: p.metricId,
          capturedAt: p.id === 'future' ? '2026-09-05T00:00:00+08:00' : '2026-09-04T00:00:00+08:00',
        }),
      ),
    ],
    3,
    now,
    options,
  );
  expect(point).toMatchObject({ ratio: 10, baseline: 30, samples: 5, status: 'ready' });
});
test('发布满N×24小时的第一次有效抓取；只有日期按北京时间0点，晚一天标补抓', () => {
  const p = post('target', { publishedAt: '2026-09-01T12:00:00+08:00' });
  expect(firstSample(p, [sample('target', 2)], 3, now)).toBeUndefined();
  const late = sample('target', 3, { capturedAt: '2026-09-05T00:00:00+08:00' });
  expect(reviewCheckpoint(target, [target, ...peers], [...samples, late], 3, now, options)).toMatchObject({
    provenance: 'backfill',
    capturedAt: late.capturedAt,
  });
  expect(firstSample(target, [sample('target', null), late], 3, now)?.value).toBe(3);
});
test('不足5条不算、0基线不除、到点缺失和未到点分开', () => {
  expect(
    reviewCheckpoint(target, peers.slice(0, 4), [...samples, sample('target', 100)], 3, now, options),
  ).toMatchObject({ status: 'insufficient', ratio: null, samples: 4 });
  expect(
    reviewCheckpoint(target, peers, [...peers.map((p) => sample(p.id, 0)), sample('target', 100)], 3, now, options),
  ).toMatchObject({ ratio: null, baseline: 0, reason: '同龄基线为0，不能计算倍数' });
  expect(reviewCheckpoint(target, peers, [], 3, now, options).status).toBe('missing');
  expect(reviewCheckpoint(target, peers, [], 21, now, options).status).toBe('pending');
});
test('只取最近20条，D21不拿未成熟作品；冻结后新增样本不改旧结果', () => {
  const many = Array.from({ length: 25 }, (_, i) =>
    post(String(i), { publishedAt: new Date(Date.UTC(2026, 7, i + 1)).toISOString() }),
  );
  const captures = many.map((p, i) => sample(p.id, i, { capturedAt: '2026-09-04T00:00:00+08:00' }));
  const value = reviewCheckpoint(target, many, [...captures, sample('target', 100)], 3, now, options) as FrozenPoint;
  expect(value.samples).toBe(20);
  expect(value.baseline).toBe(14.5);
  expect(reviewCheckpoint(target, [], [], 3, now, options, value)).toBe(value);
  expect(firstSample(target, [sample('target', 100)], 21, now)).toBeUndefined();
});
const point = (ratio: number | null) => ({
  ratio,
  baseline: 10,
  samples: 5,
  capturedAt: null,
  status: 'ready' as const,
  provenance: 'exact' as const,
  reason: null,
});
test('1.5含边界，D7不影响四类走势，缺失不是未命中', () => {
  expect(
    [
      [1.5, 1.5],
      [1, 1.5],
      [1.5, 1],
      [1, 1],
    ].map(([a, b]) => trend({ '3': point(a), '7': point(99), '21': point(b) }, 1.5)),
  ).toEqual(['爆发型', '长尾型', '昙花型', '未命中']);
  expect(trend({ '3': point(null), '21': point(1) }, 1.5)).toBe('待定');
});
test('选题同平台只算首发、跨形式合并、自动选题排除、按平台月份和火标分组', () => {
  const rows = [
    post('first', { topicId: 'topic', fire: true }),
    post('second', { topicId: 'topic', publishedAt: '2026-09-02', form: '图文' }),
    post('auto', { automatic: true }),
    post('normal'),
    post('other', { platformId: 'bilibili' }),
    post('current', { publishedAt: '2026-10-01' }),
  ];
  const points = Object.fromEntries(
    rows.map((p) => [p.id, { '3': point(1), '7': point(2), '21': point(p.id === 'normal' ? 1 : 2) }]),
  );
  expect(firstPublications(rows).has('second')).toBe(false);
  const rates = hitRates(
    rows,
    points,
    { reviewPlatforms: ['douyin', 'wechat'], hitThreshold: 1.5, conclusionMinimum: 30 },
    new Date('2026-10-18'),
  );
  expect(rates).toHaveLength(2);
  expect(rates[0]).toMatchObject({
    phase: 'final',
    conclusionAllowed: false,
    groups: [
      { group: 'fire', hits: 1, completed: 1, total: 1 },
      { group: 'non-fire', hits: 0, completed: 1, total: 1 },
    ],
  });
  expect(rates[1]).toMatchObject({ phase: 'estimated', groups: [{ total: 0 }, { hits: 1, completed: 1, total: 1 }] });
});
