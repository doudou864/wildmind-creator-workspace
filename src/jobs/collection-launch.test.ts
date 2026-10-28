import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ spawn: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), release: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }));
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  open: async () => ({ fd: 12, close: vi.fn() }),
}));
vi.mock('./lock.ts', () => ({ acquireJobLock: async () => mocks.release }));
vi.mock('./schedule.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./schedule.ts')>()),
  loadSchedule: async () => ({ platforms: ['douyin', 'bilibili'], manualOnly: [] }),
}));
vi.mock('../db/database.ts', () => ({ openDatabase: () => ({ sqlite: { close: vi.fn() } }) }));
vi.mock('./attention.ts', () => ({ pendingAttention: () => [] }));
import { startCollection, stopCollection } from './collection-control';
beforeEach(() => {
  mocks.readFile.mockRejectedValue(Error('no process'));
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { pid: 12345, unref: vi.fn() });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
});
afterEach(() => vi.resetAllMocks());
test('全部采集创建两个独立进程，各自只采一个平台', async () => {
  const result = await startCollection();
  expect(result.startedPlatforms).toEqual(['douyin', 'bilibili']);
  expect(mocks.spawn.mock.calls.map((c) => c[1].slice(-2))).toEqual([
    ['--platform', 'douyin'],
    ['--platform', 'bilibili'],
  ]);
  expect(mocks.writeFile.mock.calls.map((c) => c[0])).toEqual([
    'data/jobs/collection-douyin.json',
    'data/jobs/collection-bilibili.json',
  ]);
});
test('抖音在运行不会挡住 B站；全部采集跳过抖音', async () => {
  mocks.readFile.mockImplementation(async (file) => {
    if (file === 'data/jobs/collect-douyin.pid') return String(process.pid);
    throw Error('not found');
  });
  expect((await startCollection()).startedPlatforms).toEqual(['bilibili']);
  await expect(startCollection('douyin')).rejects.toThrow('已在采集');
  expect(mocks.spawn).toHaveBeenCalledOnce();
});
test('定时器使用相同的独立进程入口，保留 scheduled 模式', async () => {
  await startCollection(undefined, 'scheduled');
  expect(mocks.spawn.mock.calls.every((c) => c[1].at(-1) === '--scheduled')).toBe(true);
});
test('旧版整批任务未结束前不重复采集', async () => {
  mocks.readFile.mockImplementation(async (file) => {
    if (file === 'data/jobs/collect.pid') return String(process.pid);
    throw Error('not found');
  });
  await expect(startCollection()).rejects.toThrow('上一版');
  expect(mocks.spawn).not.toHaveBeenCalled();
});

test('停止只写目标平台信号，不终止其他平台或发起新采集', async () => {
  const result = await stopCollection('douyin');
  expect(result.stopping).toEqual(['douyin']);
  expect(mocks.spawn).not.toHaveBeenCalled();
  expect(mocks.writeFile.mock.calls.map((c) => c[0])).toEqual(['data/jobs/stop-douyin.json']);
  await expect(stopCollection('../invalid')).rejects.toThrow('配置');
});
test('停止后当天定时器不重启它，手动重启仍可用，其他平台正常运行', async () => {
  const { shanghaiDate } = await import('../browser/policy');
  mocks.readFile.mockImplementation(async (file) => {
    if (file === 'data/jobs/stop-douyin.json')
      return JSON.stringify({ date: shanghaiDate(), requestedAt: new Date().toISOString() });
    throw Error('not found');
  });
  expect((await startCollection(undefined, 'scheduled')).startedPlatforms).toEqual(['bilibili']);
  expect((await startCollection('douyin')).startedPlatforms).toEqual(['douyin']);
});
