import { test, expect, vi } from 'vitest';
import { runEgo } from './ego';
import { fillPublishingCopy, publishingBrowserConfig } from './publishing-runner';
vi.mock('./ego', () => ({ runEgo: vi.fn() }));
test('B站根据实际多行快照找到标签框，以回车创建独立标签', async () => {
  const cfg = (await publishingBrowserConfig()).platforms.find((p) => p.id === 'bilibili')!;
  const fill = vi.fn(),
    press = vi.fn();
  vi.mocked(runEgo).mockImplementation(async (script) => {
    const execute = new Function('taskSpace', 'console', `return (async()=>{${script}})()`);
    await execute(
      async () => ({
        page: () => ({
          fill,
          press,
          evaluate: async () => 0,
          snapshot: async () =>
            'root\n  textbox [ref=10, loc=css:input[placeholder="请输入稿件标题"]]\n  textbox [ref=51]\n',
        }),
      }),
      { log: () => {} },
    );
    return true;
  });
  await fillPublishingCopy({ spaceId: 999, label: 'p2' }, cfg, {
    title: '隔离测试',
    description: '',
    tags: ['摆烂的逗逗'],
  });
  expect(fill).toHaveBeenCalledWith('@51', '摆烂的逗逗');
  expect(press).toHaveBeenCalledWith('@51', 'Enter');
});
