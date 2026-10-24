import { describe, expect, it } from 'vitest';
import { durationSeconds, subscriberChange, reportDateRange, requireReportDates } from './values.ts';
describe('YouTube 显示值', () => {
  it('时钟时长确定性转秒，不把分秒当小数', () => {
    expect(durationSeconds('1:02')).toBe('62');
    expect(durationSeconds('1:02:03')).toBe('3723');
    expect(durationSeconds('—')).toBe('—');
    expect(() => durationSeconds('0:90')).toThrow();
  });
  it('没有相邻日的精确总量时不编造日增长', () => {
    expect(subscriberChange('0', undefined)).toBeNull();
    expect(subscriberChange('1.2万', { value: 11900, precision: 'exact' })).toBeNull();
    expect(subscriberChange('12000', { value: 11900, precision: 'display' })).toBeNull();
    expect(subscriberChange('0', { value: 1, precision: 'exact' })).toBe('-1');
  });
  it('先核对可见报表日期，不能把尚未进入统计范围的新片判成整行识别丢失', () => {
    const range = reportDateRange('控制项\n2026/9/25 – 2026/10/22\n过去 28 天');
    expect(range).toEqual({ start: '2026-09-25', end: '2026-10-22' });
    expect(() => requireReportDates(range, [{ title: 'fixture新视频', publishedAt: '2026-10-23' }])).toThrow(
      '报表仅更新至2026-10-22',
    );
    expect(() => requireReportDates(range, [{ title: 'fixture旧视频', publishedAt: '2026-10-22' }])).not.toThrow();
    expect(() => reportDateRange('过去 28 天')).toThrow('未能确认');
    expect(() => reportDateRange('2026/2/30–2026/3/2')).toThrow();
  });
});
