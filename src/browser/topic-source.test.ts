import { expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ lock: vi.fn(), release: vi.fn(), ego: vi.fn() }));
vi.mock('../jobs/lock.ts', () => ({ acquireJobLock: mocks.lock }));
vi.mock('./ego.ts', () => ({ runEgo: mocks.ego }));
vi.mock('./policy.ts', () => ({
  loadBrowserPolicy: async () => ({ platformDelayMs: [1, 1], riskMarkers: ['验证码'] }),
  pause: async () => {},
  randomBetween: () => 1,
}));
vi.mock('./collection-session.ts', () => ({
  CollectionSession: class {
    async navigate() {}
    async capture() {
      return 'fixture.png';
    }
    async scroll() {}
    async run() {
      return { url: 'https://example.com', text: 'fixture 渠道内容', bottom: true };
    }
  },
}));
import { readTopicSources } from './topic-source';
test('平台采集锁被占用时选题仍使用自己的锁和浏览器会话', async () => {
  mocks.lock.mockImplementation(async (file: string) => (file.endsWith('/collect.pid') ? null : mocks.release));
  mocks.ego.mockResolvedValue(88);
  const pages = await readTopicSources([{ id: 'fixture', location: 'https://example.com' }], 1);
  expect(pages[0].text).toBe('fixture 渠道内容');
  expect(mocks.lock.mock.calls[0][0]).toMatch(/topic-sources\.pid$/);
  expect(mocks.ego.mock.calls[0][0]).toContain('选题来源');
  expect(mocks.release).toHaveBeenCalledOnce();
});
