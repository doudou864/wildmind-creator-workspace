import { expect, test } from 'vitest';
import { datedDouyinMessages } from './inbox';
const row = (index: number, time: string, body = '文字') => ({ index, time, body, self: false, first: false });
test('从较早的日期分隔线继承日期，旧内容不误归到较新的日期，也不编造零点', () => {
  const rows = datedDouyinMessages(
    [row(0, '10/09', '新'), row(1, '', '旧'), { ...row(2, '09/16', '旧分隔'), first: true }],
    '2026-10-18',
    '2026-09-17',
    true,
  );
  expect(rows.map((r) => r.scope)).toEqual(['recent', 'old', 'old']);
  expect(rows.every((r) => r.sentAt === null)).toBe(true);
});
test('星期标签仅有近期会话证据且整段只有一条时才放行；不把未知历史当近期', () => {
  expect(datedDouyinMessages([{ ...row(0, '周三'), first: true }], '2026-10-18', '2026-09-17', true)[0].scope).toBe(
    'recent',
  );
  expect(
    datedDouyinMessages([row(0, '周三'), row(1, '周二')], '2026-10-18', '2026-09-17', true).every(
      (r) => r.scope === 'unknown',
    ),
  ).toBe(true);
  expect(datedDouyinMessages([{ ...row(0, '周三'), first: true }], '2026-10-18', '2026-09-17', false)[0].scope).toBe(
    'unknown',
  );
});
test('当天完整时刻可核对；分钟以前只确定日期，不倒推精确发送时刻', () => {
  const rows = datedDouyinMessages([row(0, '35分钟前'), row(1, '10:38')], '2026-10-18', '2026-09-17', true);
  expect(rows[0].sentAt).toBeNull();
  expect(rows[1].sentAt).toBe('2026-10-18T10:38:00+08:00');
  expect(rows.map((r) => r.scope)).toEqual(['recent', 'recent']);
});

test('日期分组可用于范围筛选，但没有自己时刻的消息不能继承精确分钟', () => {
  const rows = datedDouyinMessages(
    [row(0, '', '同组下一条'), row(1, '2026/10/09 10:38', '时间标记')],
    '2026-10-18',
    '2026-09-17',
    true,
  );
  expect(rows[0].scope).toBe('recent');
  expect(rows[0].sentAt).toBeNull();
  expect(rows[1].sentAt).toBe('2026-10-09T10:38:00+08:00');
});
