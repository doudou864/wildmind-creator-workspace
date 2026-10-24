import { expect, test, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import type { CollectionSession } from '../../browser/collection-session';
import { advanceCommentPage } from './pagination';

const cfg = {
  row: '.row',
  author: '.author',
  body: '.body',
  time: '.time',
  title: '.title',
  next: '.next',
  currentPage: '.selected',
  pageReadyTimeoutMs: 15000,
};
const oldRow = { author: '测试用户', body: '测试旧页评论', time: '2026-10-17 12:00:00', title: '测试作品' };
function fixture(mode: 'loaded' | 'timeout' | 'invalid') {
  let current = mode === 'invalid' ? '' : '7';
  let rows = [oldRow];
  const checks: boolean[] = [];
  const document = {
    querySelector: () => ({ textContent: current }),
    querySelectorAll: () =>
      rows.map((row) => ({
        querySelector: (selector: string) => ({ textContent: row[selector.slice(1) as keyof typeof row] }),
      })),
  };
  const page = {
    evaluate: async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg),
    waitForFunction: async (fn: (arg: unknown) => boolean, arg: unknown, options: { timeout: number }) => {
      expect(options.timeout).toBe(15000);
      checks.push(fn(arg)); // Page indicator changed, but old comments are still visible.
      rows = [];
      checks.push(fn(arg)); // Empty loading state is not a completed page either.
      if (mode === 'timeout') throw Error('Timeout 15000ms exceeded');
      rows = [{ ...oldRow, body: '测试新页评论' }];
      checks.push(fn(arg));
      expect(checks.at(-1)).toBe(true);
    },
  };
  const click = vi.fn(async () => {
    current = '8';
  });
  const inspect = vi.fn(async () => ({}));
  const session = {
    click,
    inspect,
    run: async (script: string) => {
      let result: unknown;
      await runInNewContext(`(async()=>{${script}})()`, {
        page,
        document,
        console: {
          log: (value: string) => {
            result = JSON.parse(value.slice('WORKSPACE_RESULT:'.length));
          },
        },
      });
      return result;
    },
  } as unknown as CollectionSession;
  return { session, checks, click, inspect };
}

test('翻页须同时看到新页码和新评论，不能把旧内容或加载空白当下一页', async () => {
  const f = fixture('loaded');
  await advanceCommentPage(f.session, cfg, JSON.stringify([oldRow]));
  expect(f.checks).toEqual([false, false, true]);
  expect(f.click).toHaveBeenCalledExactlyOnceWith('.next');
});

test('持续未加载时只点一次并报告具体页码，不能误记已读完整', async () => {
  const f = fixture('timeout');
  await expect(advanceCommentPage(f.session, cfg, JSON.stringify([oldRow]))).rejects.toThrow('第7页');
  expect(f.click).toHaveBeenCalledTimes(1);
  expect(f.inspect).toHaveBeenCalledWith('bilibili');
});

test('当前页码缺失时停止，避免在未知页继续点击', async () => {
  const f = fixture('invalid');
  await expect(advanceCommentPage(f.session, cfg, JSON.stringify([oldRow]))).rejects.toThrow('当前页码无法识别');
  expect(f.click).not.toHaveBeenCalled();
});
