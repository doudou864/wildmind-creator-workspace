import { expect, test } from 'vitest';
import { groupInbox } from './inbox-groups';
import { inboxSummary } from './inbox-summary';
import type { InboxMessage } from '../lib/inbox-model';
const message = (id: string, patch: Partial<InboxMessage> = {}): InboxMessage => ({
  id,
  revision: 0,
  platformId: 'douyin',
  platformPostId: 'post-a',
  channel: 'comment',
  author: 'fixture-user',
  body: 'fixture question',
  sentAt: null,
  capturedAt: '2026-10-21T00:00:00Z',
  sourceUrl: null,
  contentId: 'work',
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
test('platform and explicit post identity keep same-title works separate without dropping comments', () => {
  const items = [
    message('a'),
    message('b'),
    message('c', { platformId: 'youtube' }),
    message('d', { platformPostId: 'post-b' }),
    message('e', { contentId: null, platformPostId: null, contentTitle: null }),
  ];
  const groups = groupInbox(items, items);
  expect(groups.map((g) => g.items.map((m) => m.id))).toEqual([['a', 'b'], ['c'], ['d'], ['e']]);
  expect(groups.at(-1)?.title).toBe('未关联作品的评论');
  expect(groups.reduce((n, g) => n + g.waiting, 0)).toBe(inboxSummary(items).valuableWaiting);
});
test('captured source titles organize legacy comments without guessing or changing work identities', () => {
  const items = [
    message('a', { platformPostId: null, contentId: null }),
    message('b', { platformPostId: null, contentId: null }),
    message('c', { platformPostId: null, contentId: null, contentTitle: '同名作品 ' }),
  ];
  const before = JSON.stringify(items);
  expect(groupInbox(items, items).map((g) => g.items.length)).toEqual([2, 1]);
  expect(JSON.stringify(items)).toBe(before);
});
test('DM count still deduplicates conversations, archive and unknown never inflate waiting counts', () => {
  const dm = {
    channel: 'dm' as const,
    reply: {
      kind: 'dm' as const,
      conversationId: 'same',
      latestConfirmed: true,
      lastSender: 'other' as const,
      lastMessageAt: '2026-10-20T00:00:00Z',
    },
  };
  const items = [
    message('a', dm),
    message('b', dm),
    message('archived', { manualDisposition: 'replied' }),
    message('unknown', { reply: { kind: 'comment', ownReplyFound: null, repliesComplete: false } }),
  ];
  const groups = groupInbox(items, items);
  expect(groups.find((g) => g.title === '私信')?.waiting).toBe(1);
  expect(groups.reduce((n, g) => n + g.waiting, 0)).toBe(inboxSummary(items).valuableWaiting);
  expect(inboxSummary(items).valuableWaiting).toBe(1);
});
