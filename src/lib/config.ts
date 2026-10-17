import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const platformSchema = z.object({
  id: z.string(), code: z.string(), name: z.string(), active: z.boolean(),
  collection: z.string(), reviewMetric: z.string(), forms: z.array(z.string()).min(1),
  metrics: z.array(z.string()).min(1),
});
const metricSchema = z.object({ id: z.string(), name: z.string(), unit: z.string(), level: z.enum(['core', 'secondary']), scope: z.literal('account') });
const parametersSchema = z.object({
  timeRanges: z.array(z.number().int().positive()).min(1), defaultRange: z.number().int().positive(),
  recentWindow: z.number().int().positive(), checkpoints: z.array(z.number().int().positive()),
  hitThreshold: z.number().positive(), ratioPerCell: z.number().positive(), ratioCells: z.number().int().positive(),
  chartRows: z.number().int().positive().max(12), baselineSamples: z.number().int().positive(),
  baselineMinimum: z.number().int().positive(), anomalyHigh: z.number().positive(), anomalyLow: z.number().positive(),
  syncWindow: z.string(), retryTimes: z.array(z.string()),
});
export type Platform = z.infer<typeof platformSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type Parameters = z.infer<typeof parametersSchema>;
export type WorkspaceConfig = { platforms: Platform[]; metrics: Metric[]; parameters: Parameters };

export async function loadConfig(): Promise<WorkspaceConfig> {
  const read = async (name: string) => parse(await readFile(path.join(process.cwd(), 'config', name), 'utf8'));
  const [platformFile, metricFile, parameterFile] = await Promise.all([read('platforms.yaml'), read('metrics.yaml'), read('parameters.yaml')]);
  const { platforms } = z.object({ platforms: z.array(platformSchema).min(1) }).parse(platformFile);
  const { metrics } = z.object({ metrics: z.array(metricSchema).min(1) }).parse(metricFile);
  const parameters = parametersSchema.parse(parameterFile);
  if (!parameters.timeRanges.includes(parameters.defaultRange)) throw new Error('defaultRange 必须包含在 timeRanges 中');
  for (const list of [platforms, metrics]) {
    if (new Set(list.map(item => item.id)).size !== list.length) throw new Error('配置 id 不允许重复');
  }
  for (const platform of platforms) {
    if (platform.metrics.some(id => !metrics.some(metric => metric.id === id))) throw new Error(`${platform.name} 引用了不存在的指标`);
  }
  return { platforms, metrics, parameters };
}
