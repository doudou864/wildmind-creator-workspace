import { spawn } from 'node:child_process';
import { openSync, closeSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { imageTasks } from '../db/schema.ts';
import { imageDraftSchema } from '../lib/image-model.ts';
export function readImageTasks(db: WorkspaceDatabase) {
  const rows = db.db.select().from(imageTasks).orderBy(desc(imageTasks.createdAt)).all();
  for (const task of rows.filter((t) => t.status === 'queued' || t.status === 'running')) {
    let dead = false;
    if (task.pid) {
      try {
        process.kill(task.pid, 0);
      } catch (e) {
        dead = (e as NodeJS.ErrnoException).code === 'ESRCH';
      }
    } else dead = Date.now() - Date.parse(task.createdAt) > 30000;
    if (dead) {
      task.status = 'failed';
      task.reason = '后台生图进程已停止，未自动重试；请检查结果后手动重试。';
      task.updatedAt = new Date().toISOString();
      db.db
        .update(imageTasks)
        .set({ status: task.status, reason: task.reason, updatedAt: task.updatedAt })
        .where(eq(imageTasks.id, task.id))
        .run();
    }
  }
  return rows.slice(0, 30);
}
export function reserveImageTask(db: WorkspaceDatabase, id: string, raw: unknown) {
  z.uuid().parse(id);
  const input = imageDraftSchema.parse(raw);
  readImageTasks(db);
  return db.db.transaction((tx) => {
    const existing = tx.select().from(imageTasks).where(eq(imageTasks.id, id)).get();
    if (existing) {
      if (JSON.stringify(existing.input) !== JSON.stringify(input)) throw new Error('请求编号已用于另一项任务。');
      return { task: existing, created: false };
    }
    const active = tx
      .select()
      .from(imageTasks)
      .all()
      .find((t) => t.status === 'queued' || t.status === 'running');
    if (active) {
      if (JSON.stringify(active.input) === JSON.stringify(input)) return { task: active, created: false };
      throw new Error('已有后台生图任务，请等待完成后再生成。');
    }
    const now = new Date().toISOString(),
      task = {
        id,
        input,
        status: 'queued' as const,
        pid: null,
        assetIds: [],
        reason: null,
        createdAt: now,
        updatedAt: now,
      };
    tx.insert(imageTasks).values(task).run();
    return { task, created: true };
  });
}
export async function enqueueImageTask(db: WorkspaceDatabase, id: string, raw: unknown) {
  const result = reserveImageTask(db, id, raw);
  if (!result.created) return result.task;
  const directory = path.resolve('data/jobs/images');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const fd = openSync(path.join(directory, `${id}.log`), 'a', 0o600);
  try {
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', path.resolve('scripts/image-worker.mjs'), id, path.resolve(db.filename)],
      { cwd: process.cwd(), detached: true, stdio: ['ignore', fd, fd], env: process.env },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    db.db
      .update(imageTasks)
      .set({ pid: child.pid!, updatedAt: new Date().toISOString() })
      .where(eq(imageTasks.id, id))
      .run();
    child.unref();
    return { ...result.task, pid: child.pid! };
  } catch {
    db.db
      .update(imageTasks)
      .set({ status: 'failed', reason: '无法启动后台生图进程。', updatedAt: new Date().toISOString() })
      .where(eq(imageTasks.id, id))
      .run();
    throw new Error('无法启动后台生图进程，本次未调用模型。');
  } finally {
    closeSync(fd);
  }
}
