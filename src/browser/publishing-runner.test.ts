import { test, expect, vi } from 'vitest';
import { runEgo } from './ego';
import { fillPublishingCopy, publishingBrowserConfig } from './publishing-runner';
vi.mock('./ego', () => ({ runEgo: vi.fn() }));
test('小红书拒绝fill的富文本编辑器通过键盘替换正文，重复执行不累加话题', async () => {
  const cfg = (await publishingBrowserConfig()).platforms.find((p) => p.id === 'xiaohongshu')!;
  let editor = '旧正文 #旧话题',
    focused = false,
    selected = false;
  vi.mocked(runEgo).mockImplementation(async (script) => {
    await new Function('taskSpace', 'console', `return (async()=>{${script}})()`)(
      async () => ({
        page: () => ({
          fill: async (selector: string) => {
            if (selector === cfg.descriptionInput) throw Error('page.fill did not accept');
          },
          click: async () => {
            focused = true;
          },
          focus: async () => {
            focused = true;
          },
          waitForTimeout: async () => {},
          keyboard: {
            press: async (key: string) => {
              expect(focused).toBe(true);
              if (key === 'ControlOrMeta+A') selected = true;
              if (key === 'Backspace' && selected) {
                editor = '';
                selected = false;
              }
            },
            insertText: async (text: string) => {
              editor += text;
            },
            type: async (text: string) => {
              editor += text;
            },
          },
        }),
      }),
      { log: () => {} },
    );
    return true;
  });
  const copy = { title: '隔离测试', description: '说明', tags: ['测试话题'] };
  for (let i = 0; i < 2; i++) {
    await fillPublishingCopy({ spaceId: 999, label: 'p3' }, cfg, copy);
    expect(editor).toBe('说明\n#测试话题');
  }
});
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

test('视频号出现封面和删除入口时，上传进度未结束仍不能进入审核', async () => {
  const { publishingUploadComplete } = await import('./publishing-runner');
  const cfg = (await publishingBrowserConfig()).platforms.find((p) => p.id === 'channels')!;
  expect(cfg.coverRatios).toEqual(['3:4', '4:3']);
  expect(publishingUploadComplete('text "删除"\ntext "取消上传"\ntext "71%"', cfg)).toBe(false);
  expect(publishingUploadComplete('text "删除"\ntext "发表"', cfg)).toBe(true);
  expect(publishingUploadComplete('text "上传失败"\ntext "删除"', cfg)).toBe(false);
});

test('视频号通过原生话题入口生成标签，只有实际话题对象才算完成', async () => {
  const cfg = (await publishingBrowserConfig()).platforms.find((p) => p.id === 'channels')!;
  const calls: string[] = [];
  let verifiedTags: string[] = ['#摆烂的逗逗'];
  vi.mocked(runEgo).mockImplementation(async (script) => {
    await new Function('taskSpace', 'console', `return (async()=>{${script}})()`)(
      async () => ({
        page: () => ({
          fill: async () => {},
          evaluate: async (_fn: unknown, args?: { selector: string; text: string }) => {
            if (args) {
              calls.push(args.text);
              return { x: 1, y: 2 };
            }
            return verifiedTags;
          },
          mouse: { click: async () => {} },
          keyboard: { type: async (value: string) => calls.push(value), press: async (key: string) => calls.push(key) },
        }),
      }),
      { log: () => {} },
    );
    return true;
  });
  const copy = { title: '隔离测试', description: '隔离测试描述', tags: ['摆烂的逗逗'] };
  await fillPublishingCopy({ spaceId: 999, label: 'p2' }, cfg, copy);
  expect(calls).toEqual(['#话题', '摆烂的逗逗', 'Space']);
  verifiedTags = [];
  await expect(fillPublishingCopy({ spaceId: 999, label: 'p2' }, cfg, copy)).rejects.toThrow('原生话题未生成');
});
