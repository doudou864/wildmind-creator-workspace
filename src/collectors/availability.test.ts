import { expect, test } from 'vitest';
import { collectWithAvailability, PlatformDataPending, requireDailyDataDate } from './availability';
import { requireReportDates } from './youtube/values';

test('平台明确停在较早日期算采集成功且保留实际日期，不伪造最新指标', async () => {
  const daily = await collectWithAvailability(async () => requireDailyDataDate('2026-10-22', '2026-10-23'));
  expect(daily.result).toBeNull();
  expect(daily.dataPending?.through).toBe('2026-10-22');
  const youtube = await collectWithAvailability(async () =>
    requireReportDates({ start: '2026-09-25', end: '2026-10-22' }, [
      { title: 'fixture新片', publishedAt: '2026-10-23' },
    ]),
  );
  expect(youtube.dataPending?.through).toBe('2026-10-22');
});

test('普通识别、登录、日期不明等错误不能因文案提到平台更新就变成功', async () => {
  for (const error of [new Error('平台更新日期无法识别'), new Error('登录失效'), new Error('指标缺失')]) {
    await expect(
      collectWithAvailability(async () => {
        throw error;
      }),
    ).rejects.toBe(error);
  }
  for (const value of [null, '2026-02-30', '2026-10-24']) {
    await expect(
      collectWithAvailability(async () => requireDailyDataDate(value, '2026-10-23')),
    ).rejects.not.toBeInstanceOf(PlatformDataPending);
  }
  expect(await collectWithAvailability(async () => ({ posts: 7 }))).toEqual({ result: { posts: 7 } });
  expect(() => requireDailyDataDate('2026-10-23', '2026-10-23')).not.toThrow();
});
