import { test, expect } from 'vitest';
import { parseCsv, chinesePublishedAt } from './csv';
test('导出标题中的逗号、双引号与换行不能错位到指标列', () => {
  expect(parseCsv('\uFEFF标题,播放量\r\n"标题,带""引号""\n第二行",0\r\n')).toEqual([
    { 标题: '标题,带"引号"\n第二行', 播放量: '0' },
  ]);
  expect(() => parseCsv('标题,数值\n标题,1,2')).toThrow('列数');
  expect(() => parseCsv('标题,标题\n甲,乙')).toThrow('重复');
  expect(() => parseCsv('标题,数值\n"标题,1')).toThrow('未闭合');
  expect(chinesePublishedAt('2026年10月14日 09:22:07')).toBe('2026-10-14T09:22:07+08:00');
});

test('B站星级数值保持星单位语义，不能把百分位当星级转换', async () => {
  const { parseDisplayedNumber, displayedPrecision } = await import('../core/collection');
  expect(parseDisplayedNumber('4.5星')).toBe(4.5);
  expect(displayedPrecision('4.5星')).toBe('exact');
  const { bilibiliMetric } = await import('./bilibili/csv');
  expect(() => bilibiliMetric('封标点击率', '88%', { 封标点击率: '封标点击率星级' })).toThrow('独立百分位指标');
  expect(bilibiliMetric('封标点击率', '4.5星', { 封标点击率: '封标点击率星级' })).toEqual({
    label: '封标点击率星级',
    raw: '4.5星',
  });
});
