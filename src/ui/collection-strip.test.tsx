import { expect, test, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollectionStrip } from './collection-strip';
const live = vi.hoisted(() => ({
  today: undefined as string | undefined,
  running: false,
  initial: false,
  activePlatforms: [] as string[],
  attention: [] as { platform: string; reason: string; at: string }[],
}));
vi.mock('./use-resource', () => ({
  request: vi.fn(),
  useResource: (_url: string, initial: unknown) => ({
    data: live.initial ? initial : live,
    refresh: vi.fn(),
    error: '',
  }),
}));
vi.mock('./components', () => ({
  Button: ({ children }: { children: ReactNode }) => createElement('button', null, children),
}));

test('平台延迟显示成功和真实数据日期，真正失败仍显示失败原因', () => {
  const render = (platform: Parameters<typeof CollectionStrip>[0]['platforms'][number]) =>
    renderToStaticMarkup(
      createElement(CollectionStrip, {
        platforms: [platform],
        today: '2026-10-24',
        onUpdate: () => {},
      }),
    );
  const success = render({
    id: 'youtube',
    name: 'YouTube',
    status: 'success',
    lastSuccess: '2026-10-24T07:01:00Z',
    dataPending: { through: '2026-10-22', note: 'fixture' },
  });
  expect(success).toContain('采集成功');
  expect(success).toContain('平台数据更新至 10-22，等待更新');
  expect(success).not.toContain('失败原因');
  const failure = render({ id: 'youtube', name: 'YouTube', status: 'failed', reason: 'fixture登录失效' });
  expect(failure).toContain('采集失败');
  expect(failure).toContain('失败原因');
});

test('网页跨日保持打开时，用轮询日期纠正成功状态', () => {
  live.today = '2026-10-28';
  const html = renderToStaticMarkup(
    createElement(CollectionStrip, {
      platforms: [{ id: 'douyin', name: '抖音', status: 'success', lastSuccess: '2026-10-28T11:58:00Z' }],
      today: '2026-10-26',
      onUpdate: () => {},
    }),
  );
  expect(html).toContain('采集成功');
  expect(html).not.toContain('今天未更新');
  live.today = undefined;
});

test('正在采集优先于旧失败和旧待处理，结束后才展示错误', () => {
  live.running = true;
  live.activePlatforms = ['channels'];
  live.attention = [{ platform: 'channels', reason: '旧登录错误', at: '2026-10-25' }];
  const html = renderToStaticMarkup(
    createElement(CollectionStrip, {
      platforms: [{ id: 'channels', name: '视频号', status: 'failed', reason: '旧登录错误' }],
      today: '2026-10-29',
      onUpdate: () => {},
    }),
  );
  expect(html).toContain('采集中');
  expect(html).not.toContain('旧登录错误');
  expect(html).not.toContain('失败原因');
  live.running = false;
  live.activePlatforms = [];
  live.attention = [];
});

test('首次打开页面尚未取得轮询结果时，已有运行记录保持采集中', () => {
  live.initial = true;
  try {
    const html = renderToStaticMarkup(
      createElement(CollectionStrip, {
        platforms: [{ id: 'xiaohongshu', name: '小红书', status: 'running' }],
        today: '2026-10-29',
        onUpdate: () => {},
      }),
    );
    expect(html).toContain('采集中');
    expect(html).not.toContain('今天未更新');
  } finally {
    live.initial = false;
  }
});
