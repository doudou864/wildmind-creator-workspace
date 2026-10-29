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

test('截图超时先观察原工作区和当前页面，只重读截图一次；用户接管时停止', async () => {
  const { ScreenshotTimeout } = await import('./ego');
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const folder = await mkdtemp(`${tmpdir()}/fixture-shot-`);
  try {
    for (const ownership of ['agent', 'user']) {
      let captures = 0;
      const operations: string[] = [];
      const session = new CollectionSession(14, 'p1', async (script) => {
        if (script.includes('listTaskSpaces')) {
          operations.push('ownership');
          return [{ id: 14, ownership }];
        }
        if (script.includes('page.snapshot')) {
          operations.push('snapshot');
          return '当前后台';
        }
        if (script.includes('page.screenshot')) {
          captures++;
          operations.push('capture');
          if (captures === 1) throw new ScreenshotTimeout('截图超时');
          return 'saved';
        }
        throw Error('不允许点击或导航');
      });
      if (ownership === 'agent') {
        expect(await session.capture(`${folder}/current.png`)).toBe('saved');
        expect(operations).toEqual(['capture', 'ownership', 'snapshot', 'capture']);
      } else {
        await expect(session.capture(`${folder}/current.png`)).rejects.toThrow('交给你');
        expect(captures).toBe(1);
      }
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
