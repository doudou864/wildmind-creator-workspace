import { describe, expect, it } from 'vitest';
import { defaultWork, newestPosts } from './work-selection';

describe('作品数据默认查看实际发布结果', () => {
  const works = [
    { id: 'older-work', updatedAt: '2026-10-29T00:00:00Z' },
    { id: 'latest-published-work', updatedAt: '2026-10-28T00:00:00Z' },
    { id: 'new-draft', updatedAt: '2026-10-30T00:00:00Z' },
  ];
  const posts = [
    { id: 'older-post', contentId: 'older-work', publishedAt: '2026-10-26T00:00:00Z' },
    { id: 'recent-post', contentId: 'latest-published-work', publishedAt: '2026-10-28T00:00:00Z' },
  ];

  it('优先最近发布时间，不被最近编辑的草稿或旧作品抢占', () => {
    expect(defaultWork(works, posts)?.id).toBe('latest-published-work');
  });

  it('跳过不可见作品的发布记录，没有已发布作品才打开最新草稿', () => {
    expect(
      defaultWork(works, [...posts, { id: 'hidden-post', contentId: 'hidden', publishedAt: '2026-10-30' }])?.id,
    ).toBe('latest-published-work');
    expect(defaultWork(works, [])?.id).toBe('new-draft');
    expect(defaultWork([], posts)).toBeUndefined();
  });

  it('同一作品按实际发布时间选择平台，不按平台固定顺序或数组顺序', () => {
    const rows = [
      { id: 'douyin', contentId: 'same', publishedAt: '2026-10-29T20:00:00+08:00' },
      { id: 'youtube', contentId: 'same', publishedAt: '2026-10-29T13:00:00Z' },
      { id: 'unknown-date', contentId: 'same', publishedAt: null },
    ];
    expect(newestPosts(rows).map((post) => post.id)).toEqual(['youtube', 'douyin', 'unknown-date']);
    expect(rows[0].id).toBe('douyin');
  });
});
