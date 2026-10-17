import { describe, expect, it } from 'vitest';
import { durationSeconds, subscriberChange } from './values.ts';
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
});
