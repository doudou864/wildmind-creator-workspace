import { expect, test } from 'vitest';
import { inboxSummary } from './inbox-summary';
import type { InboxMessage } from '../lib/inbox-model';
const message = (id: string, patch: Partial<InboxMessage> = {}): InboxMessage => ({
  id,
  revision: 0,
  platformId: 'douyin',
  channel: 'dm',
  author: '观众',
  body: '请问怎么配置？',
  sentAt: '2026-10-17T09:00:00+08:00',
  capturedAt: '2026-10-17T10:00:00+08:00',
  sourceUrl: null,
  contentId: null,
  contentTitle: null,
  classification: { status: 'ready', result: { category: 'idea', reason: '具体问题' } },
  reply: {
    kind: 'dm',
    conversationId: 'same',
    latestConfirmed: true,
    lastSender: 'other',
    lastMessageAt: '2026-10-17T09:00:00+08:00',
  },
  context: [],
  contextComplete: false,
  dealId: null,
  dealSync: 'pending',
  dealSyncReason: null,
  topicSignalId: null,
  topicSyncedAt: null,
  ...patch,
});
test('dashboard and inbox use conversation counts, while incomplete reads never become reply tasks', () => {
  const all = [
    message('a'),
    message('b'),
    message('unread', {
      channel: 'comment',
      reply: { kind: 'comment', ownReplyFound: null, repliesComplete: false, likes: null, replyCount: null },
    }),
    message('other', {
      classification: { status: 'ready', result: { category: 'other', reason: '普通互动' } },
      reply: {
        kind: 'dm',
        conversationId: 'other',
        latestConfirmed: true,
        lastSender: 'other',
        lastMessageAt: '2026-10-17T09:00:00+08:00',
      },
    }),
  ];
  const summary = inboxSummary(all);
  expect(summary.ideaDmWaiting).toBe(1);
  expect(summary.valuableWaiting).toBe(1);
  expect(summary.waiting).toBe(2);
  expect(summary.incomplete.map((m) => m.id)).toEqual(['unread']);
});
