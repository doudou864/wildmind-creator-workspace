import { test, expect } from 'vitest';
import { channelAccountRows, exportDate } from './csv';
test('视频号说明行不能成为表头，历史日数据不能被当成当日', () => {
  const rows = channelAccountRows(
    '\uFEFF视频号关注者增长详情数据,,,,,\r\n说明,,,,,\r\n"时间","净增关注","新增关注","取消关注","关注者总数"\r\n"2026/10/16",21,21,0,218',
  );
  expect(rows[0]['关注者总数']).toBe('218');
  expect(exportDate(rows[0]['时间'])).toBe('2026-10-16');
  expect(() => exportDate('2026/02/30')).toThrow();
  expect(() => channelAccountRows('时间,总数\n昨天,233')).toThrow('表头变化');
});
