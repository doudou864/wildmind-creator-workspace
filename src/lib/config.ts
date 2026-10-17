import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const platformSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  active: z.boolean(),
  collection: z.string(),
  reviewMetric: z.string(),
  reviewMetricByForm: z.record(z.string(), z.string()).optional(),
  forms: z.array(z.string()).min(1),
  metrics: z.array(z.string()).min(1),
});
const metricLevel = z.enum(['core', 'secondary', 'input', 'on_demand', 'dropped', 'pending']);
export const metricSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  unit: z.string(),
  level: metricLevel,
  scope: z.enum(['account', 'post']),
  kind: z.enum(['number', 'text', 'distribution']),
  bindings: z
    .array(
      z.object({
        platformId: z.string().min(1),
        form: z.enum(['视频', '图文', 'all']),
        level: metricLevel,
        page: z.string().min(1).nullable(),
        method: z.enum(['screenshot', 'export', 'derived', 'none']),
        frequency: z.enum(['daily', 'checkpoints', 'monthly', 'on_demand', 'never']),
        status: z.enum(['confirmed', 'pending']),
        prd: z.string().min(1),
      }),
    )
    .min(1),
});
const parametersSchema = z.object({
  startDate: z.iso.date(),
  anomalyCheckpoints: z.array(z.number().int().positive()),
  reviewPlatforms: z.array(z.string()),
  conclusionMinimum: z.number().int().positive(),
  timeRanges: z.array(z.number().int().positive()).min(1),
  defaultRange: z.number().int().positive(),
  recentWindow: z.number().int().positive(),
  checkpoints: z.array(z.number().int().positive()),
  hitThreshold: z.number().positive(),
  ratioPerCell: z.number().positive(),
  ratioCells: z.number().int().positive(),
  chartRows: z.number().int().positive().max(12),
  baselineSamples: z.number().int().positive(),
  baselineMinimum: z.number().int().positive(),
  anomalyHigh: z.number().positive(),
  anomalyLow: z.number().positive(),
  publishUploadExpiryHours: z.number().positive(),
  syncWindow: z.string(),
  retryTimes: z.array(z.string()),
  topicCandidateCount: z.number().int().positive(),
  topicExploreMin: z.number().int().nonnegative(),
  topicExploreMax: z.number().int().nonnegative(),
  topicFireMinimum: z.number().int().positive(),
});
export type Platform = z.infer<typeof platformSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type Parameters = z.infer<typeof parametersSchema>;
export type WorkspaceConfig = { platforms: Platform[]; metrics: Metric[]; parameters: Parameters };

export async function loadConfig(configDirectory = path.join(process.cwd(), 'config')): Promise<WorkspaceConfig> {
  const read = async (name: string) => parse(await readFile(path.join(configDirectory, name), 'utf8'));
  const [platformFile, metricFile, parameterFile] = await Promise.all([
    read('platforms.yaml'),
    read('metrics.yaml'),
    read('parameters.yaml'),
  ]);
  const { platforms } = z.object({ platforms: z.array(platformSchema).min(1) }).parse(platformFile);
  const { metrics } = z.object({ metrics: z.array(metricSchema).min(1) }).parse(metricFile);
  const parameters = parametersSchema.parse(parameterFile);
  if (!parameters.timeRanges.includes(parameters.defaultRange))
    throw new Error('defaultRange 必须包含在 timeRanges 中');
  if (
    parameters.topicExploreMin > parameters.topicExploreMax ||
    parameters.topicExploreMax >= parameters.topicCandidateCount
  )
    throw new Error('探索位范围必须有效且小于候选总数');
  for (const list of [platforms, metrics]) {
    if (new Set(list.map((item) => item.id)).size !== list.length) throw new Error('配置 id 不允许重复');
  }
  for (const platform of platforms) {
    if (platform.metrics.some((id) => !metrics.some((metric) => metric.id === id)))
      throw new Error(`${platform.name} 引用了不存在的指标`);
  }
  for (const metric of metrics) {
    for (const binding of metric.bindings) {
      const platform = platforms.find((p) => p.id === binding.platformId);
      if (!platform || (binding.form !== 'all' && !platform.forms.includes(binding.form)))
        throw new Error(`指标 ${metric.id} 的平台或内容形式无效`);
      if (['core', 'secondary', 'input'].includes(binding.level) && binding.status === 'confirmed' && !binding.page)
        throw new Error(`指标 ${metric.id} 缺少采集页面`);
    }
  }
  return { platforms, metrics, parameters };
}
