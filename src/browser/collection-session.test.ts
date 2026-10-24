import { test, expect, vi } from 'vitest';
import { CollectionSession, AttentionRequired } from './collection-session';
vi.mock('./policy.ts', async (original) => ({
  ...(await original<typeof import('./policy.ts')>()),
  consumePage: vi.fn(),
}));
test('验证码和异常登录停止平台，离线不输出任何识别结果', async () => {
  const snapshot = {
    url: 'https://creator.douyin.com/creator-micro/content/manage',
    text: '请拖动滑块完成验证',
    scroll: { top: 0, height: 600, total: 1000 },
    titles: [],
  };
  const session = new CollectionSession(14, 'p1', async () => snapshot);
  await expect(session.inspect('douyin')).rejects.toBeInstanceOf(AttentionRequired);
  const offline = new CollectionSession(14, 'p1', async () => {
    throw new Error('网络已断开');
  });
  await expect(offline.inspect('douyin')).rejects.toThrow('网络已断开');
  const login = new CollectionSession(14, 'p1', async () => ({ ...snapshot, text: '扫码登录' }));
  await expect(login.inspect('douyin')).rejects.toThrow('登录失效');
});

test('打开详情按唯一标题定位，列表滚动或置顶作品改变顺序时不使用旧序号', async () => {
  const clicked: string[] = [];
  const page = {
    evaluate: async () => ['置顶测试', 'fixture 多行标题'],
    waitForTimeout: async () => {},
    waitForEvent: async () => ({ label: 'p2' }),
    click: async (selector: string) => {
      clicked.push(selector);
    },
  };
  const session = new CollectionSession(14, 'p1', async (script) => {
    let result: unknown;
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('taskSpace', 'console', script)(async () => ({ page: () => page }), {
      log: (text: string) => {
        result = JSON.parse(text.slice('WORKSPACE_RESULT:'.length));
      },
    });
    return result;
  });
  expect((await session.openDetail('fixture\n多行标题', '.title')).page).toBe('p2');
  expect(clicked).toEqual(['.title:text-is("fixture 多行标题")']);
  await expect(session.openDetail('没有的标题', '.title')).rejects.toThrow('不存在或标题不唯一');
  expect(clicked).toHaveLength(1);
});
