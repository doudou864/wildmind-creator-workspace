import { expect, test } from 'vitest';
import { latestDailySamples } from './review';
const row = (id: string, capturedAt: string, value: number | null) => ({
  id,
  postId: 'fixture',
  metricId: 'views',
  capturedAt,
  value,
  backfillKind: 'none',
});
test('旧库同日多行只用最后一份，跨日各保留一份，不改变历史原数组', () => {
  const input = [
    row('a', '2026-10-20T16:00:00Z', 1),
    row('b', '2026-10-21T11:00:00+08:00', 2),
    row('c', '2026-10-22T00:00:00+08:00', 3),
  ];
  expect(latestDailySamples(input).map((r) => r.id)).toEqual(['b', 'c']);
  expect(input).toHaveLength(3);
  expect(latestDailySamples(input, Date.parse('2026-10-21T10:00:00+08:00')).map((r) => r.id)).toEqual(['a']);
});
test('当天最新确认的未知值不能偷偷回退成旧数字，不同作品和指标独立', () => {
  const old = row('a', '2026-10-21T01:00:00Z', 1),
    next = row('b', '2026-10-21T02:00:00Z', null);
  expect(
    latestDailySamples([old, next, { ...old, id: 'c', postId: 'other' }, { ...old, id: 'd', metricId: 'likes' }]).map(
      (r) => r.value,
    ),
  ).toEqual([null, 1, 1]);
});
