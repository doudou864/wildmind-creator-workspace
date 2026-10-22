import { readFileSync } from 'node:fs';
import path from 'node:path';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { topicGenerationTasks } from '../db/schema.ts';
import { readState, writeState } from '../collectors/state.ts';
import { topicProgressSchema, type TopicProgress, type TopicTask } from '../lib/topic-model.ts';

export function taskProgress(db: WorkspaceDatabase, id: string): TopicProgress {
  return topicProgressSchema.parse(readState(db, `topic-task:${id}`) ?? {});
}
export function saveTaskProgress(db: WorkspaceDatabase, id: string, update: Partial<TopicProgress>) {
  writeState(db, `topic-task:${id}`, { ...taskProgress(db, id), ...update });
  db.db
    .update(topicGenerationTasks)
    .set({ updatedAt: new Date().toISOString() })
    .where(eq(topicGenerationTasks.id, id))
    .run();
}
function alive(pid: number) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}
export function latestTopicTask(db: WorkspaceDatabase, startupMs = 30000): TopicTask | null {
  const row = db.db
    .select()
    .from(topicGenerationTasks)
    .orderBy(desc(topicGenerationTasks.createdAt), sql`rowid desc`)
    .get();
  if (!row) return null;
  const progress = taskProgress(db, row.id);
  if (row.status === 'running' || row.status === 'queued') {
    let pid = progress.pid;
    if (!pid) {
      try {
        pid = Number(readFileSync(path.join(path.dirname(db.filename), 'jobs/topics.pid'), 'utf8'));
      } catch {}
    }
    const starting = row.status === 'queued' && Date.now() - Date.parse(row.createdAt) < startupMs;
    if (!alive(pid) && !starting) {
      row.status = 'failed';
      row.reason = '上次选题任务已中断；已采集线索保留，可以重新生成。';
      row.updatedAt = new Date().toISOString();
      const changed = db.db
        .update(topicGenerationTasks)
        .set({ status: row.status, reason: row.reason, updatedAt: row.updatedAt })
        .where(and(eq(topicGenerationTasks.id, row.id), inArray(topicGenerationTasks.status, ['queued', 'running'])))
        .run();
      if (!changed.changes) return latestTopicTask(db, startupMs);
    }
  }
  return {
    id: row.id,
    status: row.status,
    reason: row.reason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...progress,
  };
}
