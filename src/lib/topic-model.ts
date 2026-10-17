import { z } from 'zod';
export const evidenceSchema = z.object({
  count: z.number().int().positive(),
  d21: z.number().nonnegative(),
  trend: z.string(),
  reason: z.string().min(1),
});
export const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  direction: z.string().min(1),
  channelId: z.string().min(1),
  signal: z.string(),
  sourceContext: z.string(),
  sourceUrl: z
    .url()
    .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol))
    .nullable(),
  exploration: z.boolean(),
  evidence: evidenceSchema.nullable(),
  status: z.enum(['candidate', 'selected', 'skipped', 'published']),
  frozenFire: z.boolean().nullable(),
  frozenEvidence: evidenceSchema.nullable(),
  selectedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  automatic: z.boolean(),
});
export type Topic = z.infer<typeof topicSchema>;
export type TopicEvidence = z.infer<typeof evidenceSchema>;
export type TopicData = {
  topics: Topic[];
  d21Samples: number | null;
  generationReady: boolean;
  writeReady: boolean;
  serviceMessage: string;
};
export const topicStatusLabels = { candidate: '候选', selected: '已选中', skipped: '已跳过', published: '已发布' };
export function topicFire(topic: Topic, enabled: boolean) {
  return topic.frozenFire ?? (enabled && topic.evidence !== null);
}
export function topicEvidence(topic: Topic, enabled: boolean) {
  return topic.selectedAt ? topic.frozenEvidence : enabled ? topic.evidence : null;
}
// 停用渠道只影响下次生成，不能删除或隐藏已经入库的候选。
export function filterTopics(
  topics: Topic[],
  status: string,
  kind: string,
  channelId: string,
  query: string,
  fireEnabled: boolean,
) {
  return topics.filter(
    (topic) =>
      (status === 'all' || topic.status === status) &&
      (channelId === 'all' || topic.channelId === channelId) &&
      (kind === 'all' || (kind === 'fire' ? topicFire(topic, fireEnabled) : topic.exploration)) &&
      `${topic.title} ${topic.direction} ${topic.signal}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
}
// 后端接入时必须在单条记录的原子事务中调用；客户端只提交意图，不提交定格值。
export function applyTopicDecision(
  current: Topic,
  status: 'candidate' | 'selected' | 'skipped',
  samples: number,
  threshold: number,
  now: string,
): Topic {
  if (current.status === 'published') throw new Error('已发布选题不可退回候选');
  const firstSelection = status === 'selected' && current.selectedAt === null;
  const fire = firstSelection ? samples >= threshold && current.evidence !== null : current.frozenFire;
  return {
    ...current,
    status,
    updatedAt: now,
    frozenFire: fire,
    frozenEvidence: firstSelection ? (fire ? structuredClone(current.evidence) : null) : current.frozenEvidence,
    selectedAt: firstSelection ? now : current.selectedAt,
  };
}
export const topicDecisionInputSchema = z.object({ status: z.enum(['candidate', 'selected', 'skipped']) }).strict();
