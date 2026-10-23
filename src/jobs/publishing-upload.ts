import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, copyFile, open } from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { publishRecords, publishReceipts, assets } from '../db/schema.ts';
import { inspectLocalVideo } from '../lib/local-videos.ts';
import { assetFile, imageInfo } from '../lib/image-files.ts';
import { publishingBrowserConfig } from '../browser/publishing-runner.ts';
import { readPublishingTask, writePublishingTask, inspectPublishingProcess } from './publishing-tasks.ts';
import { readUploadRun, writeUploadRun, type UploadRun } from './publishing-upload-state.ts';
import type { PublishingTask } from '../lib/publishing-task-model.ts';
import { CodexJudgment } from '../ai/structured.ts';
import { publishActionSchema } from '../lib/publishing-model.ts';

export async function launchPublishingUpload(db: WorkspaceDatabase, task: PublishingTask) {
  const directory = path.resolve('data/jobs/publishing', task.batchId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const output = await open(path.join(directory, 'worker.log'), 'a', 0o600);
  try {
    const child = spawn(
      process.execPath,
      [
        '--experimental-strip-types',
        path.resolve('scripts/publishing-worker.mjs'),
        task.batchId,
        task.token,
        path.resolve(db.filename),
        task.operation ?? 'upload',
      ],
      { cwd: process.cwd(), detached: true, stdio: ['ignore', output.fd, output.fd] },
    );
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.unref();
    const identity = await inspectPublishingProcess(child.pid!);
    if (!identity) throw Error('上传进程启动后退出，请查看任务原因');
    const current = readPublishingTask(db, task.batchId);
    if (current?.token !== task.token || current.status !== 'running') {
      process.kill(-child.pid!, 'SIGTERM');
      throw Error('任务已暂停或删除');
    }
    writePublishingTask(db, {
      ...current,
      process: { pid: identity.pid, command: identity.command, startedAt: identity.startedAt },
    });
  } finally {
    await output.close();
  }
}
export async function enqueuePublishingUpload(db: WorkspaceDatabase, id: string, raw: unknown) {
  const input = publishActionSchema.parse(raw);
  if (input.action !== 'upload') throw Error('这里只接收上传');
  const batch = db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get();
  if (!batch || batch.abandonedAt) throw Error('任务不存在或已删除');
  const previous = readUploadRun(db, id);
  if (previous?.requestId === input.requestId) return batch;
  if (batch.revision !== input.expectedRevision || readPublishingTask(db, id)) throw Error('任务已更新，请刷新后操作');
  if (batch.draft.kind !== 'video' || !batch.draft.videoInput) throw Error('当前只支持视频上传');
  const cfg = await publishingBrowserConfig();
  if (
    input.platformIds.some(
      (p) => !cfg.platforms.some((c) => c.id === p) || !batch.draft.settings.some((s) => s.platformId === p),
    )
  )
    throw Error('所选平台尚未接通上传');
  const video = await inspectLocalVideo(batch.draft.videoInput.path);
  for (const other of db.db.select().from(publishRecords).all()) {
    if (other.id === id) continue;
    const run = readUploadRun(db, other.id);
    if (
      run?.sha256 === video.fingerprint.sha256 &&
      run.platforms.some((p) => input.platformIds.includes(p.id) && p.stage !== 'account')
    )
      throw Error('已有相同视频的上传记录，请先核对原任务，避免重复上传');
  }
  const directory = path.resolve('data/jobs/publishing', id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const covers: Record<string, string> = {};
  for (const ratio of new Set(input.platformIds.flatMap((p) => cfg.platforms.find((c) => c.id === p)!.coverRatios))) {
    const assetId = batch.draft.videoInput.covers[ratio];
    const asset = assetId ? db.db.select().from(assets).where(eq(assets.id, assetId)).get() : null;
    if (!asset) throw Error(`缺少 ${ratio} 封面`);
    const file = await assetFile(asset.path),
      info = await imageInfo(file),
      [w, h] = ratio.split(':').map(Number);
    if (info.width * h !== info.height * w) throw Error(`${ratio} 封面尺寸不匹配`);
    const target = path.join(
      directory,
      `cover-${ratio.replace(':', 'x')}${info.mime === 'image/png' ? '.png' : '.jpg'}`,
    );
    await copyFile(file, target);
    covers[ratio] = target;
  }
  const run: UploadRun = {
    requestId: input.requestId,
    video: video.path,
    sha256: video.fingerprint.sha256,
    covers,
    platforms: input.platformIds.map((id) => ({
      id,
      page: null,
      stage: 'account',
      attempted: false,
      copyPrepared: false,
      accountVerified: false,
      copy: { ...batch.draft.settings.find((s) => s.platformId === id)! },
      reason: null,
    })),
  };
  const task: PublishingTask = {
    batchId: id,
    token: randomUUID(),
    status: 'running',
    process: null,
    browser: null,
    checkpoint: '准备上传',
    reason: null,
    updatedAt: new Date().toISOString(),
  };
  db.db.transaction(() => {
    const live = db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get();
    if (live?.revision !== input.expectedRevision || readPublishingTask(db, id)) throw Error('任务已更新，请刷新');
    writeUploadRun(db, id, run);
    writePublishingTask(db, task);
    db.db
      .update(publishRecords)
      .set({ state: 'uploading', revision: batch.revision + 1, updatedAt: task.updatedAt })
      .where(eq(publishRecords.id, id))
      .run();
    for (const p of run.platforms)
      db.db
        .insert(publishReceipts)
        .values({
          id: randomUUID(),
          batchId: id,
          platformId: p.id,
          status: 'queued',
          title: p.copy.title,
          safeToRetry: false,
          updatedAt: task.updatedAt,
        })
        .run();
  });
  try {
    await launchPublishingUpload(db, task);
  } catch (e) {
    const live = readPublishingTask(db, id);
    if (live?.status === 'running')
      writePublishingTask(db, { ...live, status: 'interrupted', reason: e instanceof Error ? e.message : '启动失败' });
    throw e;
  }
  return db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get()!;
}
export async function adaptUploadCopy(run: UploadRun, platformId: string) {
  const p = run.platforms.find((p) => p.id === platformId)!,
    cfg = (await publishingBrowserConfig()).platforms.find((p) => p.id === platformId)!;
  if (Array.from(p.copy.title).length > cfg.titleMax) {
    const result = await new CodexJudgment().read(
      z.object({ title: z.string().min(1) }),
      `将标题压缩到 ${cfg.titleMax} 字以内，保留核心事实，不添加论点或收益。原题：${JSON.stringify(p.copy.title)}`,
    );
    if (Array.from(result.title.trim()).length > cfg.titleMax) throw Error('标题缩短后仍超限');
    if (cfg.descriptionInput) p.copy.description = [p.copy.title, p.copy.description].filter(Boolean).join('\n');
    p.copy.title = result.title.trim();
  }
  if (platformId === 'youtube')
    p.copy.description = [p.copy.description, p.copy.tags.map((t) => '#' + t.replace(/^#+/, '')).join(' ')]
      .filter(Boolean)
      .join('\n');
  if (platformId === 'channels' && !p.copy.description.trim()) p.copy.description = p.copy.title;
  if (cfg.descriptionMax !== null && Array.from(p.copy.description).length > cfg.descriptionMax)
    throw Error('正文超出平台限制，请修改后上传');
}
