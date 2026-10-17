import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { attentionItems } from '../db/schema.ts';
import { requireAttention } from '../jobs/attention.ts';
import { telemetry } from '../jobs/telemetry.ts';
export const capacitySchema = z
  .object({
    maxRecentWorks: z.number().int().positive(),
    warnAt: z.number().int().positive(),
    maxPages: z.number().int().positive(),
  })
  .refine((c) => c.warnAt < c.maxRecentWorks);
export async function loadCapacity() {
  return capacitySchema.parse(parse(await readFile('config/collection.yaml', 'utf8')).capacity);
}
export function checkCapacity(
  database: WorkspaceDatabase,
  platformId: string,
  count: number,
  config: z.infer<typeof capacitySchema>,
) {
  if (count >= config.warnAt) {
    requireAttention(database, {
      platformId,
      kind: 'capacity',
      reason: `近期作品已有${count}条，接近本轮采集上限${config.maxRecentWorks}条；请检查采集容量和每日页面预算。`,
    });
    const t = telemetry();
    if (t) t.attention = true;
  } else
    database.db
      .update(attentionItems)
      .set({ status: 'resolved', updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(attentionItems.platformId, platformId),
          eq(attentionItems.kind, 'capacity'),
          eq(attentionItems.status, 'pending'),
        ),
      )
      .run();
  if (count > config.maxRecentWorks)
    throw new Error(`近期作品${count}条超过配置上限${config.maxRecentWorks}条，未写入不完整数据，请调整容量后重试`);
}
