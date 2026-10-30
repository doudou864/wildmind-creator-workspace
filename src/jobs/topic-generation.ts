import { spawn } from 'node:child_process';
import { open, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { topicGenerationTasks } from '../db/schema.ts';
import { loadConfig } from '../lib/config.ts';
import { acquireJobLock } from './lock.ts';
import { latestTopicTask, saveTaskProgress } from './topic-task-state.ts';
import { readTopicSkill, topicSkillSnapshotPath } from '../lib/topic-skill.ts';

export async function launchTopicWorker(taskId: string, filename: string) {
  const directory = path.join(path.dirname(filename), 'jobs');
  await mkdir(directory, { recursive: true });
  const output = await open(path.join(directory, 'topics.log'), 'a', 0o600);
  try {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', 'scripts/generate-topics.mjs', taskId, path.resolve(filename)],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', output.fd, output.fd],
      },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    return child.pid!;
  } finally {
    await output.close();
  }
}
export async function startTopicGeneration(
  db: WorkspaceDatabase,
  launch = launchTopicWorker,
  expectedRevision?: string,
) {
  const config = await loadConfig();
  const release = await acquireJobLock(path.join(path.dirname(db.filename), 'jobs/topics-launch.pid'));
  if (!release) return { started: false, task: latestTopicTask(db, config.parameters.topicStartupMs) };
  try {
    const existing = latestTopicTask(db, config.parameters.topicStartupMs);
    if (existing && ['queued', 'running'].includes(existing.status)) return { started: false, task: existing };
    // Respect a pre-upgrade worker even if its task row has not yet appeared.
    const workerRelease = await acquireJobLock(path.join(path.dirname(db.filename), 'jobs/topics.pid'));
    if (!workerRelease) throw Error('已有选题任务正在运行，请稍后刷新；未重复启动。');
    await workerRelease();
    const skill = await readTopicSkill();
    if (expectedRevision && expectedRevision !== skill.revision) throw Error('Skill 已更新，请重新读取后再开始找题');
    const id = randomUUID(),
      now = new Date().toISOString();
    const snapshot = topicSkillSnapshotPath(db.filename, id);
    await mkdir(path.dirname(snapshot), { recursive: true });
    await writeFile(snapshot, JSON.stringify(skill), { mode: 0o600 });
    db.db.insert(topicGenerationTasks).values({ id, status: 'queued', createdAt: now, updatedAt: now }).run();
    saveTaskProgress(db, id, { stage: 'queued', skillRevision: skill.revision });
    try {
      const pid = await launch(id, db.filename);
      saveTaskProgress(db, id, { pid });
    } catch (error) {
      db.db
        .update(topicGenerationTasks)
        .set({
          status: 'failed',
          reason: '后台任务启动失败，请检查本机服务后重试。',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(topicGenerationTasks.id, id))
        .run();
      throw error;
    }
    return { started: true, task: latestTopicTask(db, config.parameters.topicStartupMs) };
  } finally {
    await release();
  }
}
