import { z } from 'zod';
export const inboxCategorySchema = z.enum(['deal', 'idea', 'other']);
export type InboxCategory = z.infer<typeof inboxCategorySchema>;
export const inboxChannelSchema = z.enum(['comment', 'dm']);
export type InboxChannel = z.infer<typeof inboxChannelSchema>;
export const inboxConfigSchema = z.object({
  valueRules: z.object({
    version: z.number().int().positive(),
    minReplies: z.number().int().positive(),
    batchSize: z.number().int().positive(),
    instruction: z.string().min(1),
  }),
  pageSize: z.number().int().min(1).max(100),
  categories: z
    .array(z.object({ id: inboxCategorySchema, name: z.string().min(1), description: z.string() }))
    .length(3)
    .refine((list) => new Set(list.map((c) => c.id)).size === 3),
  channels: z
    .array(z.object({ id: inboxChannelSchema, name: z.string().min(1) }))
    .length(2)
    .refine((list) => new Set(list.map((c) => c.id)).size === 2),
});
export type InboxConfig = z.infer<typeof inboxConfigSchema>;
// AI 只输出分类和证据；去向由代码按分类确定，不由模型决定接口或重试。
export const inboxClassificationSchema = z
  .object({
    category: inboxCategorySchema,
    reason: z.string().trim().min(1).max(4000),
    valueKind: z.enum(['specific_help', 'resonance', 'none']).optional(),
  })
  .strict();
export type InboxClassification =
  | { status: 'ready'; policyVersion?: number; result: z.infer<typeof inboxClassificationSchema> }
  | { status: 'pending' | 'failed'; reason: string | null };
export type ReplyEvidence =
  | {
      kind: 'dm';
      conversationId: string;
      latestConfirmed: boolean;
      lastSender: 'self' | 'other' | 'unknown';
      lastMessageAt: string | null;
    }
  | {
      kind: 'comment';
      ownReplyFound: boolean | null;
      repliesComplete: boolean;
      likes?: number | null;
      replyCount?: number | null;
    };
export type InboxMessage = {
  id: string;
  revision: number;
  platformId: string;
  channel: InboxChannel;
  author: string;
  body: string;
  sentAt: string | null;
  capturedAt: string | null;
  sourceUrl: string | null;
  contentId: string | null;
  contentTitle: string | null;
  classification: InboxClassification;
  reply: ReplyEvidence;
  context: { id: string; sender: 'self' | 'other' | 'unknown'; author: string; body: string; sentAt: string | null }[];
  contextComplete: boolean;
  dealId: string | null;
  dealSync: 'pending' | 'synced' | 'failed';
  dealSyncReason: string | null;
  topicSignalId: string | null;
  topicSyncedAt: string | null;
};
export type DemandTheme = { id: string; title: string; summary: string; messageIds: string[] };
export type InboxSource = {
  platformId: string;
  channel: InboxChannel;
  status: 'ready' | 'pending' | 'failed' | 'unavailable';
  capturedAt: string | null;
  reason: string | null;
};
export type InboxData = {
  items: InboxMessage[];
  themes: DemandTheme[];
  sources: InboxSource[];
  recordsReady: boolean;
  topicSyncReady: boolean;
  message: string;
};
export type ReplyState = 'waiting' | 'replied' | 'unknown';
export function replyState(item: InboxMessage): ReplyState {
  if (item.channel !== item.reply.kind) return 'unknown';
  if (item.reply.kind === 'comment') {
    if (item.reply.ownReplyFound === true) return 'replied';
    return item.reply.ownReplyFound === false && item.reply.repliesComplete ? 'waiting' : 'unknown';
  }
  const evidence = item.reply;
  const last = Date.parse(evidence.lastMessageAt ?? ''),
    captured = Date.parse(item.capturedAt ?? ''),
    sent = Date.parse(item.sentAt ?? '');
  if (
    !evidence.conversationId ||
    !evidence.latestConfirmed ||
    !Number.isFinite(last) ||
    !Number.isFinite(captured) ||
    last > captured ||
    (Number.isFinite(sent) && last < sent)
  )
    return 'unknown';
  return evidence.lastSender === 'self' ? 'replied' : evidence.lastSender === 'other' ? 'waiting' : 'unknown';
}
export function replyUnit(item: InboxMessage) {
  return JSON.stringify(
    item.reply.kind === 'dm'
      ? ['dm', item.platformId, item.reply.conversationId || item.id]
      : ['comment', item.platformId, item.id],
  );
}
export function assessReplies(items: InboxMessage[]) {
  const groups = new Map<string, InboxMessage[]>();
  for (const item of items) {
    const key = replyUnit(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const assessments = new Map<string, { state: ReplyState; observed: InboxMessage }>();
  for (const rows of groups.values()) {
    rows.sort((a, b) => (Date.parse(b.capturedAt ?? '') || 0) - (Date.parse(a.capturedAt ?? '') || 0));
    const observed = rows[0];
    const tied = rows.filter(
      (row) => (Date.parse(row.capturedAt ?? '') || 0) === (Date.parse(observed.capturedAt ?? '') || 0),
    );
    const states = new Set(tied.map(replyState));
    const state = states.size === 1 ? replyState(observed) : 'unknown';
    for (const row of rows) assessments.set(row.id, { state, observed });
  }
  return assessments;
}
export function waitingCount(items: InboxMessage[], allItems: InboxMessage[] = items) {
  const assessments = assessReplies(allItems);
  return new Set(items.filter((item) => assessments.get(item.id)?.state === 'waiting').map(replyUnit)).size;
}
export type InboxFilters = {
  platform: string;
  channel: string;
  category: string;
  reply: string;
  classification: string;
  query: string;
  themeId: string | null;
};
export function filterInbox(items: InboxMessage[], themes: DemandTheme[], filters: InboxFilters) {
  const theme = filters.themeId ? themes.find((t) => t.id === filters.themeId) : null;
  const assessments = assessReplies(items);
  const ids = new Set(theme?.messageIds ?? []);
  const query = filters.query.trim().toLocaleLowerCase();
  return items
    .filter(
      (item) =>
        (filters.platform === 'all' || item.platformId === filters.platform) &&
        (filters.channel === 'all' || item.channel === filters.channel) &&
        (filters.category === 'all' ||
          (item.classification.status === 'ready' && item.classification.result.category === filters.category)) &&
        (filters.reply === 'all' || assessments.get(item.id)?.state === filters.reply) &&
        (filters.classification === 'all' || item.classification.status === filters.classification) &&
        (!filters.themeId || ids.has(item.id)) &&
        `${item.author} ${item.body} ${item.contentTitle ?? ''}`.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => (Date.parse(b.sentAt ?? '') || 0) - (Date.parse(a.sentAt ?? '') || 0) || a.id.localeCompare(b.id));
}
export function inboxPage<T>(items: T[], requestedPage: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.max(1, Math.min(requestedPage, pages));
  return { page, pages, items: items.slice((page - 1) * pageSize, page * pageSize) };
}
export function canSyncTopic(item: InboxMessage) {
  return (
    item.classification.status === 'ready' && item.classification.result.category === 'idea' && !item.topicSignalId
  );
}
export const inboxTopicInputSchema = z.object({ expectedRevision: z.number().int().nonnegative() }).strict();
export function assertTopicSync(item: InboxMessage, expectedRevision: number) {
  if (item.revision !== expectedRevision) throw new Error('消息已更新，请重新读取后再同步');
  if (item.topicSignalId) return { existingSignalId: item.topicSignalId };
  if (!canSyncTopic(item)) throw new Error('只有已识别的问题与观点可以同步到选题中心');
  return { existingSignalId: null };
}
export function themeMessages(theme: DemandTheme, items: InboxMessage[]) {
  const ids = new Set(theme.messageIds);
  return items.filter((item) => ids.has(item.id));
}
export function inboxTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return '--';
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

// 共鸣必须有数字证据；不把缺失当成零，也不从措辞猜热度。
export function enforceCommentValue(
  result: z.infer<typeof inboxClassificationSchema>,
  reply: ReplyEvidence,
  rules: InboxConfig['valueRules'],
) {
  if (result.category === 'deal') return result;
  if (reply.kind === 'comment' && reply.replyCount != null && reply.replyCount >= rules.minReplies)
    return {
      ...result,
      category: 'idea' as const,
      valueKind: 'resonance' as const,
      reason: `已确认评论互动达到门槛（点赞 ${reply.likes ?? '--'}，回复 ${reply.replyCount ?? '--'}）；${result.reason}`,
    };
  if (result.valueKind === 'specific_help' || result.valueKind === undefined || result.category === 'other')
    return result;
  return {
    ...result,
    category: 'other' as const,
    valueKind: 'none' as const,
    reason: '未达到高互动门槛或缺少互动数字证据；原判断：' + result.reason,
  };
}
