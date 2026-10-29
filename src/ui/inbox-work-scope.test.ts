import { describe, expect, it } from 'vitest';
import type { InboxMessage } from '../lib/inbox-model';
import { filterInbox } from '../lib/inbox-model';
import { inboxSummary } from './inbox-summary';
import { matchesInboxWorkScope, resolveInboxWorkScope } from './inbox-work-scope';

const works = [
  { id: 'work-a', title: '同名作品' },
  { id: 'work-b', title: '同名作品' },
];
const posts = [
  { id: 'local-a', contentId: 'work-a', platformId: 'douyin', platformPostId: 'native-a' },
  { id: 'local-b', contentId: 'work-b', platformId: 'douyin', platformPostId: 'native-b' },
  { id: 'local-youtube', contentId: 'work-a', platformId: 'youtube', platformPostId: 'native-a' },
];
const message = (id: string, patch: Partial<InboxMessage> = {}): InboxMessage => ({
  id,
  revision: 0,
  platformId: 'douyin',
  platformPostId: 'native-a',
  channel: 'comment',
  author: '测试观众',
  body: '测试问题',
  sentAt: null,
  capturedAt: null,
  sourceUrl: null,
  contentId: 'work-a',
  contentTitle: '同名作品',
  classification: { status: 'ready', result: { category: 'idea', reason: 'fixture' } },
  reply: { kind: 'comment', ownReplyFound: false, repliesComplete: true },
  context: [],
  contextComplete: true,
  dealId: null,
  dealSync: 'pending',
  dealSyncReason: null,
  topicSignalId: null,
  topicSyncedAt: null,
  ...patch,
});

describe('作品评论范围只信已确认身份', () => {
  it('把本机post ID解析成平台作品ID，同名作品与相同ID的其他平台不会混入', () => {
    const scope = resolveInboxWorkScope({ content: 'work-a', post: 'local-a' }, works, posts);
    const items = [
      message('correct'),
      message('same-title-other-work', { contentId: 'work-b', platformPostId: 'native-b' }),
      message('other-platform', { platformId: 'youtube' }),
      message('local-id-is-not-native-id', { platformPostId: 'local-a' }),
      message('unknown-source', { contentId: null, platformPostId: null }),
      message('contradictory-content', { contentId: 'work-b' }),
    ];
    expect(items.filter((item) => matchesInboxWorkScope(item, scope)).map((item) => item.id)).toEqual(['correct']);
  });

  it('只有作品范围时接纳明确content ID或已映射的平台ID，不按标题补来源', () => {
    const scope = resolveInboxWorkScope({ content: 'work-a' }, works, posts);
    const items = [
      message('content-only', { platformPostId: null }),
      message('post-only', { contentId: null }),
      message('title-only', { contentId: null, platformPostId: null }),
    ];
    expect(items.filter((item) => matchesInboxWorkScope(item, scope)).map((item) => item.id)).toEqual([
      'content-only',
      'post-only',
    ]);
  });

  it('指定平台记录缺失平台ID时不退回整条作品或同名评论', () => {
    const scope = resolveInboxWorkScope({ post: 'local-a' }, works, [{ ...posts[0], platformPostId: null }]);
    expect(scope?.status).toBe('ready');
    expect(matchesInboxWorkScope(message('unknown'), scope)).toBe(false);
  });

  it.each([
    { content: 'missing' },
    { post: 'missing' },
    { content: 'missing', post: 'local-a' },
    { content: 'work-a', post: 'local-b' },
  ])('无效或不一致范围明确失败，绝不放宽到其他作品：%j', (query) => {
    const scope = resolveInboxWorkScope(query, works, posts);
    expect(scope?.status).toBe('invalid');
    expect(matchesInboxWorkScope(message('would-leak'), scope)).toBe(false);
  });

  it('支持作品合并后的正确关联，但归档或不可见作品不能回退到其他范围', () => {
    const mergedWorks = [...works, { id: 'old', title: '旧名', mergedInto: 'work-a' }];
    expect(resolveInboxWorkScope({ content: 'old', post: 'local-a' }, mergedWorks, posts)).toMatchObject({
      status: 'ready',
      contentId: 'work-a',
    });
    const archived = works.map((work) => ({ ...work, archivedAt: work.id === 'work-a' ? '2026-10-30' : null }));
    expect(resolveInboxWorkScope({ post: 'local-a' }, archived, posts)?.status).toBe('invalid');
  });

  it('作品限制可与既有主题、消息、价值和回复过滤叠加，回复未知不会变成待回复', () => {
    const scope = resolveInboxWorkScope({ content: 'work-a', post: 'local-a' }, works, posts);
    const items = [
      message('target'),
      message('same-work-outside-theme'),
      message('unknown-reply', { reply: { kind: 'comment', ownReplyFound: null, repliesComplete: false } }),
      message('low-value', { classification: { status: 'ready', result: { category: 'other', reason: 'fixture' } } }),
    ];
    const valuable = new Set(inboxSummary(items).valuable.map((item) => item.id));
    const filtered = filterInbox(
      items,
      [{ id: 'theme', title: '测试主题', summary: '', messageIds: ['target', 'unknown-reply', 'low-value'] }],
      {
        platform: 'all',
        channel: 'comment',
        category: 'all',
        reply: 'waiting',
        classification: 'all',
        query: '',
        themeId: 'theme',
      },
    ).filter((item) => matchesInboxWorkScope(item, scope) && valuable.has(item.id));
    expect(filtered.map((item) => item.id)).toEqual(['target']);
    expect(resolveInboxWorkScope({}, works, posts)).toBeNull();
    expect(matchesInboxWorkScope(message('unscoped'), null)).toBe(true);
  });
});
