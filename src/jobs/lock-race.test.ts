import { afterEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { acquireJobLock } from './lock';

vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof fs>()),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

test('其他平台刚释放锁时退出竞争，不能把正常释放报为采集失败', async () => {
  vi.mocked(fs.writeFile).mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }));
  vi.mocked(fs.readFile).mockRejectedValueOnce(Object.assign(new Error('released'), { code: 'ENOENT' }));
  await expect(acquireJobLock('fixture/lock')).resolves.toBeNull();
});

test('刚创建但尚未写完的锁视为占用，不能误删或误报损坏', async () => {
  vi.mocked(fs.writeFile).mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }));
  vi.mocked(fs.readFile).mockResolvedValueOnce('');
  await expect(acquireJobLock('fixture/lock')).resolves.toBeNull();
});

test('真实权限错误仍明确失败，不能吞掉', async () => {
  vi.mocked(fs.writeFile).mockRejectedValueOnce(Object.assign(new Error('exists'), { code: 'EEXIST' }));
  vi.mocked(fs.readFile).mockRejectedValueOnce(Object.assign(new Error('permission'), { code: 'EACCES' }));
  await expect(acquireJobLock('fixture/lock')).rejects.toThrow('permission');
});
