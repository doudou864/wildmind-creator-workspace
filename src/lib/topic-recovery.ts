import { readFile } from 'node:fs/promises';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { rawRecords, topicGenerationTasks } from '../db/schema.ts';
import { isTopicReadTimeout } from '../browser/topic-source.ts';
import { topicSkillSnapshotPath, type TopicSkill } from './topic-skill.ts';

const pageSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  text: z.string(),
  error: z.string().nullable(),
  warning: z.string().optional(),
  screenshots: z.array(z.string()),
  links: z.array(z.object({ title: z.string(), url: z.string() })).optional(),
  discoveryOnly: z.boolean(),
});
export async function loadTopicRecovery(db: WorkspaceDatabase, id: string) {
  const snapshotPath = topicSkillSnapshotPath(db.filename, id);
  const task = db.db.select().from(topicGenerationTasks).where(eq(topicGenerationTasks.id, id)).get();
  if (!task || task.status !== 'failed' || !isTopicReadTimeout(task.reason ?? ''))
    throw Error('只有浏览器超时中断的任务可用已读材料继续；用户接管或其他失败不能自动续接');
  const pages = db.db
    .select()
    .from(rawRecords)
    .where(sql`json_extract(${rawRecords.content}, '$.taskId') = ${id}`)
    .all()
    .map((row) => ({ ...pageSchema.parse(row.content), capturedAt: row.capturedAt }));
  if (!pages.some((p) => !p.error && !p.discoveryOnly && p.text.trim()))
    throw Error('这轮没有保存可用于判断的网页原文，请重新找题');
  const skill: TopicSkill = JSON.parse(await readFile(snapshotPath, 'utf8'));
  return { skill, pages };
}
