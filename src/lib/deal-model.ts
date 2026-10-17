import { z } from 'zod';
import type { InboxMessage, ReplyState } from './inbox-model';
export const dealStatusSchema = z.enum(['pending', 'following', 'completed']);
export type DealStatus = z.infer<typeof dealStatusSchema>;
export const dealConfigSchema = z.object({
  pageSize: z.number().int().min(1).max(100),
  brandMaxLength: z.number().int().positive(),
  requirementMaxLength: z.number().int().positive(),
  statuses: z
    .array(z.object({ id: dealStatusSchema, name: z.string().min(1), description: z.string() }))
    .length(3)
    .refine((rows) => new Set(rows.map((row) => row.id)).size === 3),
});
export type DealConfig = z.infer<typeof dealConfigSchema>;
const timestamp = z.iso.datetime({ offset: true });
export const dealSuggestionSchema = z
  .object({
    id: z.string().min(1),
    status: dealStatusSchema,
    reason: z.string().trim().min(1),
    expectedRevision: z.number().int().nonnegative(),
    evidenceMessageId: z.string().min(1),
    evidenceRevision: z.number().int().nonnegative(),
  })
  .strict();
export const dealSchema = z
  .object({
    id: z.string().min(1),
    revision: z.number().int().nonnegative(),
    brand: z.string().nullable(),
    requirement: z.string().nullable(),
    status: dealStatusSchema,
    source: z
      .object({ platformId: z.string().min(1), channel: z.enum(['comment', 'dm']), messageId: z.string().min(1) })
      .strict(),
    createdAt: timestamp,
    updatedAt: timestamp,
    suggestion: dealSuggestionSchema.nullable(),
  })
  .strict();
export type Deal = z.infer<typeof dealSchema>;
export type DealData = {
  items: Deal[];
  messages: InboxMessage[];
  recordsReady: boolean;
  writeReady: boolean;
  suggestionReady: boolean;
  message: string;
};
export type DealFields = Pick<Deal, 'brand' | 'requirement' | 'status'>;
export function dealEditSchema(config: DealConfig) {
  return z
    .object({
      brand: z.string().trim().min(1).max(config.brandMaxLength).nullable(),
      requirement: z.string().trim().min(1).max(config.requirementMaxLength).nullable(),
      status: dealStatusSchema,
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict();
}
export const dealSuggestionInputSchema = z
  .object({ suggestionId: z.string().min(1), expectedRevision: z.number().int().nonnegative() })
  .strict();
export function dealFields(deal: Deal): DealFields {
  return { brand: deal.brand, requirement: deal.requirement, status: deal.status };
}
export function dealSource(deal: Deal, messages: InboxMessage[]) {
  return messages.find(
    (m) =>
      m.id === deal.source.messageId && m.platformId === deal.source.platformId && m.channel === deal.source.channel,
  );
}
export function dealCounts(items: Deal[]) {
  return {
    pending: items.filter((d) => d.status === 'pending').length,
    following: items.filter((d) => d.status === 'following').length,
    completed: items.filter((d) => d.status === 'completed').length,
  };
}
export type DealFilters = { status: string; platform: string; channel: string; query: string; linkedId: string | null };
export function filterDeals(items: Deal[], messages: InboxMessage[], filters: DealFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return items
    .filter(
      (d) =>
        (filters.status === 'all' || d.status === filters.status) &&
        (filters.platform === 'all' || d.source.platformId === filters.platform) &&
        (filters.channel === 'all' || d.source.channel === filters.channel) &&
        (!filters.linkedId || d.id === filters.linkedId) &&
        `${d.brand ?? ''} ${d.requirement ?? ''} ${dealSource(d, messages)?.author ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id));
}
export function dealActions(items: Deal[], messages: InboxMessage[], replies: Map<string, { state: ReplyState }>) {
  return items.filter((deal) => {
    const source = dealSource(deal, messages);
    const state = source ? replies.get(source.id)?.state : undefined;
    return source && (state === 'waiting' || (state === 'unknown' && deal.status === 'pending'));
  });
}
// 接入后在单条记录事务内调用；来源与创建时间不可通过编辑覆盖。
export function applyDealEdit(
  current: Deal,
  input: DealFields & { expectedRevision: number },
  config: DealConfig,
  now: string,
): Deal {
  const parsed = dealEditSchema(config).parse(input);
  if (parsed.expectedRevision !== current.revision) throw new Error('商单已更新，请载入最新记录后再修改');
  timestamp.parse(now);
  if (Date.parse(now) < Date.parse(current.updatedAt)) throw new Error('更新时间不能早于当前记录');
  const { expectedRevision, ...fields } = parsed;
  if (JSON.stringify(dealFields(current)) === JSON.stringify(fields)) return current;
  return { ...current, ...fields, revision: expectedRevision + 1, updatedAt: now, suggestion: null };
}
export function suggestionIssue(deal: Deal, messages: InboxMessage[]) {
  const suggestion = deal.suggestion;
  if (!suggestion) return '暂无状态建议';
  if (suggestion.expectedRevision !== deal.revision) return '商单已更新，这条建议已失效';
  if (suggestion.status === deal.status) return '当前已是建议状态，无需重复确认';
  const source = dealSource(deal, messages),
    evidence = messages.find((m) => m.id === suggestion.evidenceMessageId);
  if (
    !source ||
    !evidence ||
    source.channel !== 'dm' ||
    evidence.channel !== 'dm' ||
    evidence.platformId !== source.platformId ||
    source.reply.kind !== 'dm' ||
    evidence.reply.kind !== 'dm' ||
    !source.reply.conversationId ||
    source.reply.conversationId !== evidence.reply.conversationId
  )
    return '建议的原始会话证据不可用';
  if (evidence.revision !== suggestion.evidenceRevision) return '会话证据已更新，请等待重新判断';
  if (!evidence.body.trim()) return '建议的证据原文缺失，暂不能确认';
  const captured = Date.parse(evidence.capturedAt ?? '');
  if (
    !Number.isFinite(captured) ||
    messages.some(
      (m) =>
        m.platformId === evidence.platformId &&
        m.reply.kind === 'dm' &&
        evidence.reply.kind === 'dm' &&
        m.reply.conversationId === evidence.reply.conversationId &&
        Date.parse(m.capturedAt ?? '') > captured,
    )
  )
    return '已有更新的会话读取，请等待重新判断';
  return null;
}
export function acceptDealSuggestion(
  current: Deal,
  input: z.infer<typeof dealSuggestionInputSchema>,
  messages: InboxMessage[],
  config: DealConfig,
  now: string,
) {
  dealSuggestionInputSchema.parse(input);
  if (current.revision !== input.expectedRevision || current.suggestion?.id !== input.suggestionId)
    throw new Error('状态建议已更新，请重新读取');
  const issue = suggestionIssue(current, messages);
  if (issue) throw new Error(issue);
  return applyDealEdit(
    current,
    { ...dealFields(current), status: current.suggestion!.status, expectedRevision: input.expectedRevision },
    config,
    now,
  );
}
export function confirmedDeal(current: Deal, fields: DealFields, value: unknown) {
  const result = dealSchema.parse(value);
  if (
    result.id !== current.id ||
    result.revision <= current.revision ||
    result.createdAt !== current.createdAt ||
    result.source.messageId !== current.source.messageId ||
    result.source.platformId !== current.source.platformId ||
    result.source.channel !== current.source.channel ||
    result.brand !== fields.brand ||
    result.requirement !== fields.requirement ||
    result.status !== fields.status ||
    Date.parse(result.updatedAt) < Date.parse(current.updatedAt)
  )
    throw new Error('保存结果未确认，请刷新记录核对');
  return result;
}
// 仅展示读取时能确认的等待时长，不伪装成实时监控。
export function waitingDuration(message: InboxMessage) {
  const start = Date.parse(message.reply.kind === 'dm' ? (message.reply.lastMessageAt ?? '') : (message.sentAt ?? '')),
    end = Date.parse(message.capturedAt ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return '--';
  const minutes = Math.floor((end - start) / 60000);
  return minutes >= 1440
    ? `${Math.floor(minutes / 1440)}天 ${Math.floor((minutes % 1440) / 60)}小时`
    : minutes >= 60
      ? `${Math.floor(minutes / 60)}小时 ${minutes % 60}分钟`
      : `${minutes}分钟`;
}

export function dealActionGroups(items: Deal[], messages: InboxMessage[], replies: Map<string, { state: ReplyState }>) {
  const groups = new Map<string, { id: string; message: InboxMessage; deals: Deal[] }>();
  for (const deal of dealActions(items, messages, replies)) {
    const message = dealSource(deal, messages)!;
    const id = JSON.stringify(
      message.reply.kind === 'dm'
        ? ['dm', message.platformId, message.reply.conversationId || message.id]
        : ['comment', message.platformId, message.id],
    );
    const group = groups.get(id);
    if (group) group.deals.push(deal);
    else groups.set(id, { id, message, deals: [deal] });
  }
  return [...groups.values()];
}
