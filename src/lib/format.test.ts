import { expect, test } from 'vitest';
import { lastSuccessTimeLabel } from './format';
test('抓取日志的 UTC 时刻按北京时间显示，跨 UTC 午夜不误标前一天', () => {
  expect(lastSuccessTimeLabel('2026-10-18T02:40:00Z', '2026-10-18')).toBe('10:40');
  expect(lastSuccessTimeLabel('2026-10-17T20:00:00Z', '2026-10-18')).toBe('04:00');
  expect(lastSuccessTimeLabel('2026-10-17T02:40:00Z', '2026-10-18')).toBe('-1D 10:40');
  expect(lastSuccessTimeLabel('2026-10-18T10:40:00+08:00', '2026-10-18')).toBe('10:40');
  expect(lastSuccessTimeLabel(null, '2026-10-18')).toBe('--');
  expect(lastSuccessTimeLabel('bad', '2026-10-18')).toBe('--');
});
