import { expect, test } from 'vitest';
import { inboxDate, inboxTimestampInScope } from './inbox-date';
test('按北京起号日包含边界，不让 UTC 日期误排或未知日期混入', () => {
  const now = '2026-10-18T00:00:00+08:00';
  expect(inboxTimestampInScope('2026-09-16T16:00:00Z', '2026-09-17', now)).toBe(true);
  expect(inboxTimestampInScope('2026-09-16T15:59:59Z', '2026-09-17', now)).toBe(false);
  expect(inboxTimestampInScope(null, '2026-09-17', now)).toBe(false);
  expect(inboxTimestampInScope('2027-01-01T00:00:00Z', '2026-09-17', now)).toBe(false);
});
test('显示日期可确定范围但不编造发送时刻；跨年旧消息不能当成未来消息', () => {
  expect(inboxDate('09-17', '2026-10-18')).toBe('2026-09-17');
  expect(inboxDate('2026年9月16日 12:00', '2026-10-18')).toBe('2026-09-16');
  expect(inboxDate('昨天 20:00', '2026-09-17')).toBe('2026-09-16');
  expect(inboxDate('12-31', '2026-01-02')).toBe('2025-12-31');
  expect(inboxDate('周三', '2026-10-18')).toBeNull();
  expect(inboxDate('02-30', '2026-10-18')).toBeNull();
});
