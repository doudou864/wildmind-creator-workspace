import { expect, test } from 'vitest';
import { collectionArgs } from './collection-control';
import { existingCollectionSpace } from '../browser/collection-space';
test('手动按钮只允许配置的平台，不把输入交给 shell', () => {
  expect(collectionArgs('douyin', ['douyin'])).toEqual([
    '--experimental-strip-types',
    'scripts/collect.mjs',
    '--platform',
    'douyin',
  ]);
  expect(collectionArgs(undefined, ['douyin'])).not.toContain('--platform');
  expect(() => collectionArgs('douyin; rm', ['douyin'])).toThrow();
});
test('已删除采集空间不再被永久复用，仍存在的用户空间不能被抢回', async () => {
  expect(await existingCollectionSpace(20, async () => [])).toBeUndefined();
  expect(await existingCollectionSpace(20, async () => [{ id: 20, ownership: 'agent' }])).toBe(20);
  await expect(existingCollectionSpace(20, async () => [{ id: 20, ownership: 'user' }])).rejects.toThrow('交给你');
});
import { platformSchedule } from './schedule';
test('升级不重放当天旧调度已消耗的重试，成功状态按平台继承', () => {
  const old = { attempted: ['main', '11:00'], successfulPlatforms: ['douyin'], succeeded: false };
  expect(platformSchedule(old, 636, 'douyin').succeeded).toBe(true);
  expect(platformSchedule(old, 636, 'bilibili')).toEqual({
    chosen: 636,
    attempted: ['main', '11:00'],
    succeeded: false,
    successfulPlatforms: [],
  });
});
