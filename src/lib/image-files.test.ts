import { test, expect } from 'vitest';
import { exactCrop } from './image-files';
import { imageFailure } from '../ai/image-generation';
test('真实返回尺寸轻裁成严格比例，不拉伸、不容许大幅裁切', () => {
  expect(exactCrop(941, 1672, '9:16', 0.02)).toEqual({ width: 936, height: 1664 });
  expect(exactCrop(1672, 941, '16:9', 0.02)).toEqual({ width: 1664, height: 936 });
  expect(exactCrop(1086, 1448, '3:4', 0.02)).toEqual({ width: 1086, height: 1448 });
  expect(() => exactCrop(1024, 1024, '9:16', 0.02)).toThrow('偏差过大');
});
test('失败原因以中文区分超时、套餐额度、未登录', () => {
  expect(imageFailure(new Error('AbortError'))).toContain('超时');
  expect(imageFailure(new Error('usage limit exceeded'))).toContain('套餐额度');
  expect(imageFailure(new Error('401 unauthorized'))).toContain('登录');
});
