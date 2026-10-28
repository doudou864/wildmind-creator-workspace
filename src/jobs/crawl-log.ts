import { beginExecutionLog, executionEvent } from './execution-log.ts';
import { beginTelemetry, type RunTelemetry } from './telemetry.ts';
const activeRuns = new Map<string, RunTelemetry>();
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { backupDatabase } from '../db/database.ts';
import { crawlLogs } from '../db/schema.ts';

export function startCrawl(database: WorkspaceDatabase, platformId: string, now = new Date().toISOString()) {
  if (!platformId.trim()) throw new Error('抓取日志必须指定平台');
  const id = randomUUID();
  activeRuns.set(id, beginTelemetry());
  beginExecutionLog(database.filename, id);
  database.db
    .insert(crawlLogs)
    .values({ id, platformId, startedAt: now, status: 'running', archivePaths: [], updatedAt: now })
    .run();
  return id;
}
export async function finishCrawl(
  database: WorkspaceDatabase,
  id: string,
  result:
    | { status: 'success'; archivePaths?: string[]; dataPending?: { through: string; note: string } }
    | { status: 'failed'; reason: string; archivePaths?: string[] },
  now = new Date().toISOString(),
) {
  if (result.status === 'failed' && !result.reason.trim()) throw new Error('失败必须记录原因');
  const paths = result.archivePaths ?? [];
  if (paths.some((p) => !p.startsWith('data/') || p.split('/').includes('..')))
    throw new Error('存档路径必须位于 data/');
  const saved = database.db
    .update(crawlLogs)
    .set({
      status: result.status,
      telemetry: activeRuns.has(id)
        ? {
            ...activeRuns.get(id)!,
            ...(result.status === 'success' && result.dataPending ? { dataPending: result.dataPending } : {}),
          }
        : null,
      reason: result.status === 'failed' ? result.reason : null,
      archivePaths: paths,
      finishedAt: now,
      updatedAt: now,
    })
    .where(and(eq(crawlLogs.id, id), eq(crawlLogs.status, 'running')))
    .run();
  if (saved.changes !== 1) throw new Error('抓取不存在或已结束，不能重复结束');
  if (activeRuns.has(id))
    executionEvent('采集任务', result.status, result.status === 'failed' ? result.reason : result.dataPending?.note);
  activeRuns.delete(id);
  // Every finished crawl, including failures, leaves a recoverable database backup.
  return backupDatabase(database);
}
