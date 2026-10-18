import { test, expect } from 'vitest';
import { enforceCommentValue } from './inbox-model';
import { loadInboxConfig } from './inbox-config';

test('具体求助不需要点赞，普通观点须至少5条真实回复，点赞再高也不能单独入选', async () => {
  const { valueRules } = await loadInboxConfig();
  const reply = { kind: 'comment' as const, ownReplyFound: null, repliesComplete: false };
  const resonance = { category: 'idea' as const, reason: '用户共鸣', valueKind: 'resonance' as const };
  expect(enforceCommentValue(resonance, reply, valueRules).category).toBe('other');
  expect(
    enforceCommentValue(resonance, { ...reply, likes: 999, replyCount: valueRules.minReplies - 1 }, valueRules)
      .category,
  ).toBe('other');
  expect(enforceCommentValue(resonance, { ...reply, likes: 10000 }, valueRules).category).toBe('other');
  expect(enforceCommentValue(resonance, { ...reply, replyCount: valueRules.minReplies }, valueRules).category).toBe(
    'idea',
  );
  expect(
    enforceCommentValue(
      { ...resonance, valueKind: 'specific_help', reason: '请问博主如何使用Claude' },
      reply,
      valueRules,
    ).category,
  ).toBe('idea');
  expect(
    enforceCommentValue(
      resonance,
      { kind: 'dm', conversationId: 'one', latestConfirmed: true, lastSender: 'other', lastMessageAt: null },
      valueRules,
    ).category,
  ).toBe('other');
});
