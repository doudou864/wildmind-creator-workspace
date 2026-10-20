import type { WorkspaceDatabase } from '../db/database';
import { postSnapshots } from '../db/schema';
import { eq } from 'drizzle-orm';
export type AnalysisRead = Record<string, Record<string, { value: number | null; precision: string; unit?: string }>>;
// Exact stored readings keyed by the comparison's existing sampling timestamp. No resampling or inversion.
export function analysisRead(
  database: WorkspaceDatabase,
  postId?: string,
  metrics: { id: string; unit: string }[] = [],
): AnalysisRead {
  if (!postId) return {};
  const result: AnalysisRead = {};
  for (const row of database.db.select().from(postSnapshots).where(eq(postSnapshots.postId, postId)).all()) {
    (result[row.capturedAt] ??= {})[row.metricId] = {
      value: row.value,
      precision: row.precision,
      unit: metrics.find((m) => m.id === row.metricId)?.unit,
    };
  }
  return result;
}
