import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { publishRecords, publishReceipts } from '../db/schema.ts';
import { readState, writeState } from '../collectors/state.ts';
import {
  closePublishingBrowser,
  pausePublishingBrowser,
  findPublishingBrowser,
  inspectPublishingBrowser,
  continuePublishingBrowser,
} from '../browser/publishing-task.ts';
import { readUploadRun, writeUploadRun } from './publishing-upload-state.ts';
import { publishingTaskSchema, type PublishingTask, type PublishingTaskAction } from '../lib/publishing-task-model.ts';
const key = (id: string) => `publishing-task:${id}`;
export function readPublishingTask(db: WorkspaceDatabase, id: string): PublishingTask | null {
  const value = readState(db, key(id));
  return value ? publishingTaskSchema.parse(value) : null;
}
export function writePublishingTask(db: WorkspaceDatabase, task: PublishingTask) {
  writeState(db, key(task.batchId), { ...task, updatedAt: new Date().toISOString() });
}
export async function inspectPublishingProcess(pid: number) {
  try {
    const { stdout } = await promisify(execFile)('ps', [
      '-p',
      String(pid),
      '-o',
      'pgid=',
      '-o',
      'lstart=',
      '-o',
      'stat=',
      '-o',
      'command=',
    ]);
    const match = stdout.trim().match(/^(\d+)\s+(\w+\s+\w+\s+\d+\s+[\d:]+\s+\d+)\s+(\S+)\s+(.+)$/);
    if (!match || match[3].startsWith('Z')) return null;
    return { pid, group: Number(match[1]), startedAt: match[2], command: match[4] };
  } catch (e) {
    if ((e as { code?: number }).code === 1) return null;
    throw Error('无法核验发布任务进程，未发送停止信号');
  }
}
async function signalTaskProcess(task: PublishingTask, signal: NodeJS.Signals) {
  if (!task.process) return;
  const current = await inspectPublishingProcess(task.process.pid);
  if (!current) return;
  if (
    current.group !== current.pid ||
    current.command !== task.process.command ||
    current.startedAt !== task.process.startedAt ||
    !current.command.includes(task.token)
  )
    throw Error('运行进程身份已变化，未关闭任何其他进程');
  process.kill(-current.pid, signal);
}
export async function stopPublishingProcess(task: PublishingTask) {
  await signalTaskProcess(task, 'SIGTERM');
  if (!task.process) return;
  for (let i = 0; i < 10; i++) {
    if (!(await inspectPublishingProcess(task.process.pid))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await signalTaskProcess(task, 'SIGKILL');
  for (let i = 0; i < 10; i++) {
    if (!(await inspectPublishingProcess(task.process.pid))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw Error('任务进程尚未退出，请重试清理');
}
// The upload adapter must register its isolated process and workspace before doing any platform work.
export function registerPublishingTask(
  db: WorkspaceDatabase,
  batchId: string,
  resources: Pick<PublishingTask, 'process' | 'browser'>,
  token = randomUUID(),
) {
  const batch = db.db.select().from(publishRecords).where(eq(publishRecords.id, batchId)).get();
  if (!batch || batch.abandonedAt) throw Error('发布任务不存在或已删除');
  const previous = readPublishingTask(db, batchId);
  if (previous && !['paused', 'interrupted'].includes(previous.status)) throw Error('这条任务已有运行或清理记录');
  const task: PublishingTask = {
    batchId,
    token,
    ...resources,
    status: 'running',
    checkpoint: previous?.checkpoint ?? '开始上传',
    reason: null,
    updatedAt: new Date().toISOString(),
  };
  writePublishingTask(db, task);
  return task;
}
// Late worker output cannot advance a paused or deleted task.
export function publishingCheckpoint(db: WorkspaceDatabase, batchId: string, token: string, checkpoint: string) {
  const task = readPublishingTask(db, batchId);
  if (!task || task.token !== token || !['running', 'pausing'].includes(task.status)) return false;
  const proceed = task.status === 'running';
  writePublishingTask(db, { ...task, checkpoint, status: task.status });
  return proceed;
}
type Controls = {
  stop: (task: PublishingTask) => Promise<void>;
  close: (browser: NonNullable<PublishingTask['browser']>) => Promise<void>;
  pauseBrowser?: typeof pausePublishingBrowser;
  resume?: (task: PublishingTask) => Promise<void>;
  inspectBrowser?: typeof inspectPublishingBrowser;
  continueBrowser?: typeof continuePublishingBrowser;
};
export async function controlPublishingTask(
  db: WorkspaceDatabase,
  id: string,
  input: PublishingTaskAction,
  controls: Controls = {
    stop: stopPublishingProcess,
    close: closePublishingBrowser,
    pauseBrowser: pausePublishingBrowser,
    inspectBrowser: inspectPublishingBrowser,
    continueBrowser: continuePublishingBrowser,
  },
) {
  const restarting = input.action === 'resume' || input.action === 'rebuild-upload';
  const rebuilding = input.action === 'rebuild-upload';
  const initial = readPublishingTask(db, id);
  if (restarting) {
    const batch = db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get();
    const old = initial;
    if (!batch || batch.abandonedAt || batch.revision !== input.expectedRevision)
      throw Error('任务已更新，请刷新后操作');
    if (!old || !['paused', 'interrupted', 'attention'].includes(old.status))
      throw Error('只有暂停或中断的任务可以恢复');
    if (old?.process) await controls.stop(old);
    if (rebuilding) {
      if (old.operation === 'publish' || readState(db, 'publishing-approval:' + id))
        throw Error('任务已进入发布提交，请先核对平台结果，不能重新上传');
      const browser = old.browser ?? (old.browserName ? await findPublishingBrowser(old.browserName) : null);
      if (browser && (await (controls.inspectBrowser ?? inspectPublishingBrowser)(browser)))
        throw Error('原浏览器仍在，请点击“继续处理”恢复原页面，无需重建');
    } else if (old.browser && controls.continueBrowser) {
      try {
        await controls.continueBrowser(old.browser);
      } catch (error) {
        const current = readPublishingTask(db, id);
        if (current?.token === old.token && current.status === old.status)
          writePublishingTask(db, { ...current, reason: error instanceof Error ? error.message : '浏览器恢复失败' });
        throw error;
      }
    }
  }
  const task = db.db.transaction(() => {
    const batch = db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get();
    if (!batch || batch.abandonedAt || batch.revision !== input.expectedRevision)
      throw Error('任务已更新，请刷新后操作');
    const old = readPublishingTask(db, id);
    if (restarting && (old?.token !== initial?.token || old?.status !== initial?.status))
      throw Error('任务状态已变化，请刷新后操作');
    if (input.action === 'pause' && old?.status !== 'running') throw Error('这条任务当前没有正在运行的上传');
    if (restarting && (!old || !['paused', 'interrupted', 'attention'].includes(old.status)))
      throw Error('只有已暂停的任务可以继续');
    if (restarting && !controls.resume)
      controls.resume = async (task) => {
        const { launchPublishingUpload } = await import('./publishing-upload.ts');
        await launchPublishingUpload(db, task);
      };
    if (input.action === 'delete' && old?.status === 'deleted') return old;
    if (old && ['pausing', 'deleting'].includes(old.status)) throw Error('任务正在停止或清理，请等待结果');
    if (rebuilding) {
      const run = readUploadRun(db, id);
      const receipts = db.db.select().from(publishReceipts).where(eq(publishReceipts.batchId, id)).all();
      if (!run) throw Error('上传资料不存在，未重建');
      if (
        old?.operation === 'publish' ||
        readState(db, 'publishing-approval:' + id) ||
        receipts.some(
          (r) =>
            ['submitting', 'published', 'pending_review'].includes(r.status) ||
            r.failureStage === 'publish' ||
            r.platformPostId ||
            r.publishedAt ||
            r.url,
        )
      )
        throw Error('已有发布提交或结果待核对，不能重建上传；原回执已保留');
      writeUploadRun(db, id, {
        ...run,
        platforms: run.platforms.map((p) => ({
          ...p,
          page: null,
          stage: 'account',
          attempted: false,
          accountVerified: false,
          reviewObservation: undefined,
          reason: null,
        })),
      });
      for (const receipt of receipts)
        db.db
          .update(publishReceipts)
          .set({
            status: 'uploading',
            screenshotAssetId: null,
            uploadedAt: null,
            materials: null,
            failureStage: null,
            safeToRetry: false,
            revision: receipt.revision + 1,
            reason: '原页面已关闭，按本人操作重新准备上传',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(publishReceipts.id, receipt.id))
          .run();
    }
    const next: PublishingTask = {
      batchId: id,
      operation: old?.operation,
      browserName: rebuilding ? undefined : old?.browserName,
      token: restarting ? randomUUID() : (old?.token ?? randomUUID()),
      process: restarting ? null : (old?.process ?? null),
      browser: rebuilding
        ? null
        : old?.browser
          ? {
              ...old.browser,
              pausedByTask: input.action === 'resume' && controls.continueBrowser ? false : old.browser.pausedByTask,
            }
          : null,
      checkpoint: rebuilding ? '重建浏览器，重新准备上传' : (old?.checkpoint ?? '本地草稿，尚未上传'),
      reason: null,
      updatedAt: new Date().toISOString(),
      status: input.action === 'pause' ? 'pausing' : restarting ? 'running' : 'deleting',
    };
    writePublishingTask(db, next);
    db.db
      .update(publishRecords)
      .set({
        revision: batch.revision + 1,
        updatedAt: next.updatedAt,
        ...(rebuilding ? { state: 'running' as const } : {}),
      })
      .where(eq(publishRecords.id, id))
      .run();
    return next;
  });
  if (input.action === 'pause') {
    try {
      await controls.stop(task);
      if (task.browser && controls.pauseBrowser) await controls.pauseBrowser(task.browser);
      writePublishingTask(db, {
        ...task,
        status: 'paused',
        process: null,
        browser: task.browser && controls.pauseBrowser ? { ...task.browser, pausedByTask: true } : task.browser,
      });
    } catch (e) {
      writePublishingTask(db, { ...task, status: 'interrupted', reason: e instanceof Error ? e.message : '暂停失败' });
      throw e;
    }
    return readPublishingTask(db, id);
  }
  if (restarting) {
    try {
      await controls.resume!(task);
      return readPublishingTask(db, id);
    } catch (e) {
      writePublishingTask(db, { ...task, status: 'paused', reason: e instanceof Error ? e.message : '恢复失败' });
      throw e;
    }
  }
  if (task.status === 'deleted') return task;
  try {
    await controls.stop(task);
    const browser = task.browser ?? (task.browserName ? await findPublishingBrowser(task.browserName) : null);
    if (browser) await controls.close(browser);
    db.db.transaction(() => {
      const current = readPublishingTask(db, id);
      if (current?.token !== task.token || current.status !== 'deleting') throw Error('清理状态发生变化，请刷新核对');
      for (const receipt of db.db.select().from(publishReceipts).where(eq(publishReceipts.batchId, id)).all()) {
        if (['uploading', 'submitting', 'queued'].includes(receipt.status))
          db.db
            .update(publishReceipts)
            .set({
              status: 'unknown',
              safeToRetry: false,
              reason: '任务已删除，平台结果需人工核对；禁止重复提交',
              revision: receipt.revision + 1,
            })
            .where(eq(publishReceipts.id, receipt.id))
            .run();
      }
      writePublishingTask(db, { ...task, status: 'deleted', process: null, browser: null });
      db.db
        .update(publishRecords)
        .set({ abandonedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(publishRecords.id, id))
        .run();
    });
  } catch (e) {
    writePublishingTask(db, { ...task, status: 'cleanup_failed', reason: e instanceof Error ? e.message : '清理失败' });
    throw e;
  }
  return readPublishingTask(db, id);
}

export async function reconcilePublishingTasks(db: WorkspaceDatabase) {
  for (const batch of db.db.select().from(publishRecords).all()) {
    const task = readPublishingTask(db, batch.id);
    if (!task || task.status !== 'running') continue;
    const current = task.process ? await inspectPublishingProcess(task.process.pid) : null;
    if (!task.process && Date.now() - Date.parse(task.updatedAt) < 30000) continue;
    if (task.process && current?.command === task.process.command && current.startedAt === task.process.startedAt)
      continue;
    const live = readPublishingTask(db, batch.id);
    if (
      live?.token !== task.token ||
      live.status !== 'running' ||
      JSON.stringify(live.process) !== JSON.stringify(task.process)
    )
      continue;
    writePublishingTask(db, {
      ...live,
      status: 'interrupted',
      reason: '后台进程已停止或身份变化，保留已有页面；继续时先核对进度',
    });
  }
}
