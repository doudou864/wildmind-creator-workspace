import { test, expect, vi } from 'vitest';
import { collectPlatformInbox } from './platform-inbox';
import type { WorkspaceDatabase } from '../db/database';
import type { CollectionSession } from '../browser/collection-session';
import type { Judgment } from '../ai/structured';
const mocks = vi.hoisted(() => ({ comments: vi.fn(), dm: vi.fn(), source: vi.fn() }));
vi.mock('./bilibili/inbox.ts', () => ({ collectBilibiliInbox: mocks.comments, collectBilibiliDM: mocks.dm }));
vi.mock('../lib/inbox-store.ts', async (original) => ({
  ...(await original<typeof import('../lib/inbox-store.ts')>()),
  inboxSource: mocks.source,
}));
test('私信识别出错必须反馈失败，不能把已完成评论也改为失败', async () => {
  mocks.comments.mockResolvedValue({});
  mocks.dm.mockRejectedValue(Error('当前私信截图无法识别'));
  await expect(
    collectPlatformInbox({} as WorkspaceDatabase, 'bilibili', {} as CollectionSession, {} as Judgment, []),
  ).rejects.toThrow('当前私信截图无法识别');
  expect(mocks.source).toHaveBeenCalledOnce();
  expect(mocks.source.mock.calls[0][1]).toMatchObject({ channel: 'dm', status: 'failed' });
});
