import { eq } from 'drizzle-orm';
import { openDatabase } from '../src/db/database.ts';
import { topicGenerationTasks } from '../src/db/schema.ts';
import { generateSkillTopics } from '../src/lib/topic-agent-store.ts';
import { beginExecutionLog, executionEvent } from '../src/jobs/execution-log.ts';
const [taskId, filename] = process.argv.slice(2);
if (!taskId || !filename) throw Error('缺少选题任务标识');
const db = openDatabase(filename);
try {
  const task = db.db.select().from(topicGenerationTasks).where(eq(topicGenerationTasks.id, taskId)).get();
  if (task?.status !== 'queued') throw Error('任务不存在或已经执行');
  if (/^[0-9a-f-]{36}$/.test(taskId)) beginExecutionLog(filename, taskId);
  await generateSkillTopics(db, taskId);
  executionEvent('选题任务', 'success');
} catch (error) {
  const reason = error instanceof Error ? error.message : '选题任务失败';
  executionEvent('选题任务', 'failed', reason);
  db.db
    .update(topicGenerationTasks)
    .set({ status: 'failed', reason, updatedAt: new Date().toISOString() })
    .where(eq(topicGenerationTasks.id, taskId))
    .run();
  console.error(reason);
  process.exitCode = 1;
} finally {
  db.sqlite.close();
}
