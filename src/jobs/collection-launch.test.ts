import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), release: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  open: async () => ({ fd: 12, close: vi.fn() }),
}));
vi.mock('./lock.ts', () => ({ acquireJobLock: async () => mocks.release }));
vi.mock('./schedule.ts', () => ({ loadSchedule: async () => ({ platforms: ['douyin', 'bilibili'] }) }));
import { startCollection } from './collection-control';
afterEach(() => vi.resetAllMocks());
for (const platform of ['douyin', undefined])
  test(`按钮启动真实命令入口：${platform ?? '全部'}（进程替身，不采集真实数据）`, async () => {
    mocks.readFile.mockRejectedValue(Error('no existing process'));
    mocks.spawn.mockImplementation(() => {
      const child = Object.assign(new EventEmitter(), { pid: 12345, unref: vi.fn() });
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });
    expect(await startCollection(platform)).toEqual({ started: true });
    expect(mocks.spawn.mock.calls[0][1]).toEqual([
      '--experimental-strip-types',
      'scripts/collect.mjs',
      ...(platform ? ['--platform', platform] : []),
    ]);
    expect(mocks.writeFile).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
test('已有采集进程时重复点击不会再启动', async () => {
  mocks.readFile.mockResolvedValue(String(process.pid));
  await expect(startCollection('douyin')).rejects.toThrow('已有采集');
  expect(mocks.spawn).not.toHaveBeenCalled();
});
