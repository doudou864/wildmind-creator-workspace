import { z } from 'zod';
export const evidenceSchema = z.object({
  count: z.number().int().positive(),
  d21: z.number().nonnegative(),
  trend: z.string(),
  reason: z.string().min(1),
});
export const topicSchema = z.object({
  fixture: z.boolean().optional(),
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
export const topicSourceReportSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  status: z.enum(['pending', 'reading', 'completed', 'failed']),
  reason: z.string().nullable().default(null),
  count: z.number().default(0),
});
export const topicProgressSchema = z.object({
  pid: z.number().default(0),
  stage: z
    .enum(['queued', 'collecting', 'researching', 'extracting', 'generating', 'reviewing', 'saving', 'finished'])
    .default('queued'),
  currentSource: z.string().default(''),
  sources: z.array(topicSourceReportSchema).default([]),
  sourceCount: z.number().default(0),
  cachedCount: z.number().default(0),
  count: z.number().default(0),
  warning: z.string().nullable().default(null),
});
export type TopicProgress = z.infer<typeof topicProgressSchema>;
export type TopicTask = TopicProgress & {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  reason: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TopicData = {
  generation?: TopicTask | null;
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
