import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  lock: vi.fn(),
  release: vi.fn(),
  ego: vi.fn(),
  navigate: vi.fn(),
  observe: vi.fn(),
}));
vi.mock('../jobs/lock.ts', () => ({ acquireJobLock: mocks.lock }));
vi.mock('./ego.ts', () => ({ runEgo: mocks.ego }));
vi.mock('./policy.ts', () => ({
  loadBrowserPolicy: async () => ({ platformDelayMs: [1, 1], riskMarkers: ['验证码'] }),
  pause: async () => {},
  randomBetween: () => 1,
}));
vi.mock('./collection-session.ts', () => ({
  CollectionSession: class {
    async navigate(url: string) {
      await mocks.navigate(url);
    }
    async capture() {
      return 'fixture.png';
    }
    async scroll() {}
    async run() {
      return mocks.observe();
    }
  },
}));
import { readTopicSources } from './topic-source';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.observe.mockReset().mockResolvedValue({ url: 'https://example.com', text: 'fixture 渠道内容', bottom: true });
  mocks.navigate.mockReset().mockResolvedValue(undefined);
  mocks.lock.mockResolvedValue(mocks.release);
  mocks.ego.mockResolvedValue(88);
});
test('平台采集锁被占用时选题仍使用自己的锁和浏览器会话', async () => {
  mocks.lock.mockImplementation(async (file: string) => (file.endsWith('/collect.pid') ? null : mocks.release));
  mocks.ego.mockResolvedValue(88);
  const pages = await readTopicSources([{ id: 'fixture', location: 'https://example.com' }], 1);
  expect(pages[0].text).toBe('fixture 渠道内容');
  expect(mocks.lock.mock.calls[0][0]).toMatch(/topic-sources\.pid$/);
  expect(mocks.ego.mock.calls[0][0]).toContain('选题来源');
  expect(mocks.release).toHaveBeenCalledOnce();
});

test('网络失败跳到下站，未滚到底仍保留已有原文及读取范围', async () => {
  mocks.navigate.mockRejectedValueOnce(Error('网络连接失败'));
  mocks.observe.mockResolvedValue({ url: 'https://example.com/feed', text: 'fixture 实际读到的原文', bottom: false });
  const onPage = vi.fn(async () => {});
  const pages = await readTopicSources(
    [
      { id: 'bad', location: 'https://example.com/bad' },
      { id: 'good', location: 'https://example.com/feed' },
    ],
    1,
    { onPage },
  );
  expect(pages[0].error).toBe('网络连接失败');
  expect(pages[1]).toMatchObject({
    error: null,
    text: 'fixture 实际读到的原文',
    warning: expect.stringContaining('读取上限'),
  });
  expect(onPage).toHaveBeenCalledTimes(2);
});

test('登录墙跳过，用户接管则停止，不换窗口绕过', async () => {
  mocks.observe.mockResolvedValueOnce({ url: 'https://example.com/login', text: '登录', bottom: true });
  const pages = await readTopicSources(
    [
      { id: 'login', location: 'https://example.com' },
      { id: 'good', location: 'https://example.com' },
    ],
    1,
  );
  expect(pages[0].error).toContain('需要登录');
  expect(pages[1].error).toBeNull();
  mocks.navigate.mockClear().mockRejectedValueOnce(Error('控制权已交给用户，不自动重试'));
  await expect(
    readTopicSources(
      [
        { id: 'one', location: 'https://example.com' },
        { id: 'two', location: 'https://example.com' },
      ],
      1,
    ),
  ).rejects.toThrow('控制权');
  expect(mocks.navigate).toHaveBeenCalledOnce();
});

test('追加研究页复用同一工作区，并保留观察链接供追原文；网页跳转不冒充配置源', async () => {
  mocks.observe
    .mockResolvedValueOnce({
      url: 'https://example.com',
      text: 'fixture来源',
      bottom: true,
      links: [{ title: '正文', url: 'https://news.example.org/article' }],
    })
    .mockResolvedValueOnce({ url: 'https://news.example.org/article', text: 'fixture正文', bottom: true });
  const nextBatch = vi
    .fn()
    .mockResolvedValueOnce([{ id: 'detail', location: 'https://example.com/redirect', allowRedirect: true }])
    .mockResolvedValue([]);
  const pages = await readTopicSources([{ id: 'feed', location: 'https://example.com' }], 1, {
    nextBatch,
    maxLinks: 1,
  });
  expect(mocks.ego).toHaveBeenCalledOnce();
  expect(pages[0].links).toEqual([{ title: '正文', url: 'https://news.example.org/article' }]);
  expect(pages[1]).toMatchObject({ url: 'https://news.example.org/article', error: null });
  expect(mocks.navigate).toHaveBeenCalledTimes(2);
});

test('搜索跳转也不能重新采用用户已停用的来源', async () => {
  mocks.observe.mockResolvedValueOnce({
    url: 'https://disabled.example.com/article',
    text: 'fixture原文',
    bottom: true,
  });
  const pages = await readTopicSources(
    [
      {
        id: 'fixture',
        location: 'https://example.com/redirect',
        allowRedirect: true,
        blockedHosts: ['disabled.example.com'],
      },
    ],
    1,
  );
  expect(pages[0]).toMatchObject({ error: '该来源已停用，不采用本页', text: '' });
});
