import { beforeEach, expect, test, vi } from 'vitest';
const store = vi.hoisted(() => ({ write: vi.fn(), source: vi.fn(), themes: vi.fn() }));
vi.mock('../../lib/inbox-store.ts', () => ({
  storeInboxReading: store.write,
  inboxSource: store.source,
  refreshThemes: store.themes,
}));
vi.mock('../../lib/config.ts', () => ({ loadConfig: async () => ({ parameters: { startDate: '2020-01-01' } }) }));
import { collectDouyinComments, exactCommentCount } from './comments';
import type { WorkspaceDatabase } from '../../db/database';
import type { CollectionSession } from '../../browser/collection-session';
const db = {
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ all: () => [{ id: 'fixture', title: '测试作品', publishedAt: '2026-10-01', removed: false }] }),
      }),
    }),
  },
} as unknown as WorkspaceDatabase;
const rows = [
  {
    author: '测试读者',
    body: '具体问题',
    time: '今天 10:00',
    likes: '12',
    expand: '收起',
    replies: [{ author: '作者', body: '已回复', time: '今天', owner: true }],
  },
  { author: '测试读者2', body: '另一个问题', time: '今天 10:10', likes: '2', expand: '', replies: [] },
];
function session(end = true) {
  const detail = {
    click: vi.fn(),
    inspect: vi.fn(),
    capture: vi.fn(),
    close: vi.fn(),
    scroll: vi.fn(),
    run: vi.fn(async (script: string) => {
      if (script.includes('.flatMap')) return [0];
      if (script.includes('rows:Array.from')) return { rows, end, url: 'https://example.test/work/fixture' };
      if (script.includes('await page.url')) return 'https://example.test/work/fixture';
      return true;
    }),
  };
  return {
    detail,
    value: { navigate: vi.fn(), click: vi.fn(), fill: vi.fn(), run: vi.fn(), openDetail: vi.fn(async () => detail) },
  };
}
beforeEach(() => vi.clearAllMocks());
test('进入作品评论管理并按整条作品存储，作者回复不误判为待回复，点赞数字无需AI识别', async () => {
  const s = session();
  await collectDouyinComments(db, s.value as unknown as CollectionSession, { read: vi.fn() }, []);
  expect(s.value.navigate.mock.calls[0][0]).toContain('creator.douyin.com/creator-micro/content/manage');
  expect(s.value.fill).toHaveBeenCalledWith('input[placeholder="搜索作品"]', '测试作品');
  expect(s.detail.click.mock.calls[0][0]).toBe('text="评论管理"');
  expect(s.detail.click.mock.calls[1][0]).toContain('[class^="load-reply-"]');
  const reading = store.write.mock.calls[0][4];
  expect(reading.messages.map((m: { reply: unknown }) => m.reply)).toEqual([
    { kind: 'comment', ownReplyFound: true, repliesComplete: true, likes: 12, replyCount: 1 },
    { kind: 'comment', ownReplyFound: false, repliesComplete: true, likes: 2, replyCount: 0 },
  ]);
  expect(store.write).toHaveBeenCalledOnce();
  expect(exactCommentCount('1.2万')).toBeNull();
});
test('未读到作品评论末尾不提交半份结果覆盖旧数据', async () => {
  const s = session(false);
  await expect(
    collectDouyinComments(db, s.value as unknown as CollectionSession, { read: vi.fn() }, []),
  ).rejects.toThrow('尚未读到末尾');
  expect(store.write).not.toHaveBeenCalled();
});
