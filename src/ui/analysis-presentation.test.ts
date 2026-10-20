import { test, expect } from 'vitest';
import { analysisRows, analysisValue } from './analysis-presentation';
import type { Comparison } from '../core/data-center';
const row = { id: 'likes', name: '点赞量', unit: '次/千播放', value: 22.18, capturedAt: 'sample' } as Comparison;
test('counts use the original same-time reading, never reverse rounded normalized values', () => {
  expect(analysisValue(row, { sample: { likes: { value: 26, precision: 'exact' } } })).toBe('26 · 每千播放 22.18');
  expect(analysisValue(row, {})).toBe('每千播放 22.18');
});
test('only explicitly equivalent rates with an available count are folded; missing count keeps platform rate', () => {
  const rate = { ...row, id: 'rate', name: '点赞率' };
  const settings = { keyNames: [], groups: {}, equivalentRates: { 点赞量: '点赞率' } };
  expect(analysisRows([row, rate], settings)).toEqual([row]);
  expect(analysisRows([{ ...row, value: null }, rate], settings)).toHaveLength(2);
});
