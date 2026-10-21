import { afterEach, expect, test, vi } from 'vitest';
const disk = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('node:fs/promises', () => ({ readFile: disk.read }));
import { watchCollectionCancellation, collectionSignal, throwIfCollectionCancelled } from './cancellation';
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});
test('停止信号中止正在等待的操作，后续入库守卫拒绝继续；下次任务使用全新信号', async () => {
  vi.useFakeTimers();
  disk.read.mockRejectedValue(Error('no stop'));
  const cleanup = watchCollectionCancellation('douyin');
  const signal = collectionSignal()!;
  await vi.advanceTimersByTimeAsync(500);
  expect(signal.aborted).toBe(false);
  disk.read.mockResolvedValue(JSON.stringify({ requestedAt: '2026-10-21T10:00:00Z' }));
  await vi.advanceTimersByTimeAsync(500);
  expect(signal.aborted).toBe(true);
  expect(disk.read.mock.calls.at(-1)?.[0]).toBe('data/jobs/stop-douyin.json');
  expect(throwIfCollectionCancelled).toThrow('已停止');
  cleanup();
  expect(collectionSignal()).toBeUndefined();
  const next = watchCollectionCancellation('bilibili');
  expect(collectionSignal()?.aborted).toBe(false);
  next();
});
