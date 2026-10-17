import { test, expect } from 'vitest';
import { ageInDays, detailCheckpoints, historicalKind, parseDisplayedNumber } from './collection';
test('检查点按满24小时，失败后的最近一次补抓，不重写已完成检查点', () => {
  expect(ageInDays('2026-10-14T02:20:00+08:00', new Date('2026-10-17T02:19:59+08:00'))).toBe(2);
  expect(ageInDays('2026-10-14T02:20:00+08:00', new Date('2026-10-17T02:20:00+08:00'))).toBe(3);
  expect(detailCheckpoints(4, [1, 3, 7, 21], [1])).toEqual({ needed: true, due: [3] });
  expect(detailCheckpoints(4, [1, 3, 7, 21], [1, 3]).needed).toBe(false);
  expect(detailCheckpoints(4, [1, 3, 7, 21], [1, 3], true).needed).toBe(true);
});
test('历史补录只允许21至35天，未知不当零，非法数字失败', () => {
  expect([20, 21, 35, 36].map((d) => historicalKind(d, [21, 35]))).toEqual([
    'none',
    'historical',
    'historical',
    'none',
  ]);
  expect(parseDisplayedNumber('—')).toBeNull();
  expect(parseDisplayedNumber('0')).toBe(0);
  expect(parseDisplayedNumber('1.5万')).toBe(15000);
  expect(parseDisplayedNumber('9.2万次播放')).toBe(92000);
  expect(parseDisplayedNumber('34.11%')).toBe(34.11);
  expect(parseDisplayedNumber('-40')).toBe(-40);
  expect(() => parseDisplayedNumber('约两万')).toThrow();
});

test('流量归组由代码求和，缺失来源不能假定为零', async () => {
  const { groupSources } = await import('./collection');
  expect(
    groupSources(
      new Map([
        ['主页', '6.3%'],
        ['关注', '5.5%'],
      ]),
      { 私域: ['主页', '关注'] },
    ),
  ).toEqual([{ label: '私域', raw: '11.8' }]);
  expect(groupSources(new Map([['主页', '6.3%']]), { 私域: ['主页', '关注'] })).toEqual([{ label: '私域', raw: null }]);
  expect(
    groupSources(
      new Map([
        ['主页', '0%'],
        ['关注', '0%'],
      ]),
      { 私域: ['主页', '关注'] },
    ),
  ).toEqual([{ label: '私域', raw: '0' }]);
});

test('同名无描述作品必须按时间区分，不能把视频和图文混为一条', async () => {
  const { matchPost } = await import('./collection');
  const video = { title: '无作品描述', publishedAt: '2023-03-21T15:59:00+08:00', form: '视频' };
  const image = { title: '无作品描述', publishedAt: '2023-03-21T17:26:00+08:00', form: '图文' };
  expect(matchPost([video, image], image)).toBe(image);
  expect(matchPost([video, image], { ...image, publishedAt: '2023-03-22T17:26:00+08:00' })).toBeUndefined();
});

test('重新起号只纳入最近30天，过界和未来作品都不能建档或建选题', async () => {
  const { withinRecentWindow } = await import('./collection');
  const now = new Date('2026-10-17T12:00:00+08:00');
  expect(withinRecentWindow('2026-09-17T12:00:00+08:00', now, 30)).toBe(true);
  expect(withinRecentWindow('2026-09-17T11:59:59+08:00', now, 30)).toBe(false);
  expect(withinRecentWindow('2024-11-04T22:59:00+08:00', now, 30)).toBe(false);
  expect(withinRecentWindow('2026-10-18T12:00:00+08:00', now, 30)).toBe(false);
});

test('账号日期按北京时间归一，等价日期不误报，真正跨日不能混入同一天', async () => {
  const { normalizeDataDate } = await import('./collection');
  expect(normalizeDataDate('2026-10-16')).toBe('2026-10-16');
  expect(normalizeDataDate('2026-10-16T00:00:00+08:00')).toBe('2026-10-16');
  expect(normalizeDataDate('2026-10-16T17:00:00Z')).toBe('2026-10-17');
  expect(() => normalizeDataDate('2026-02-30')).toThrow();
  expect(() => normalizeDataDate('昨天')).toThrow();
});
