import { resumePublishingBrowser } from '../browser/publishing-task.ts';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { publishRecords, publishReceipts } from '../db/schema.ts';
import { readState, writeState } from '../collectors/state.ts';
import { publishingData } from '../lib/publishing-store.ts';
import { publishActionSchema, publishMaterialKey, readyPublishReceipts } from '../lib/publishing-model.ts';
import { loadConfig } from '../lib/config.ts';
import { loadPublishingConfig } from '../lib/publishing-config.ts';
import { fingerprint } from '../lib/local-videos.ts';
import { readUploadRun } from './publishing-upload-state.ts';
import { readPublishingTask, writePublishingTask } from './publishing-tasks.ts';
import { launchPublishingUpload } from './publishing-upload.ts';
import { CodexJudgment } from '../ai/structured.ts';
import {
  publishingBrowserConfig,
  navigatePublishing,
  waitPublishingAccount,
  publishingObservation,
  publishingPageCall,
  screenshotPublishing,
} from '../browser/publishing-runner.ts';
const approvalSchema = z.object({
  requestId: z.string(),
  receiptIds: z.array(z.string()),
  approvedAt: z.string(),
  materials: z.string(),
});
export async function enqueuePublishingSubmit(db: WorkspaceDatabase, id: string, raw: unknown) {
  const input = publishActionSchema.parse(raw);
  if (input.action !== 'publish-all') throw Error('发布需要本人确认');
  const key = 'publishing-approval:' + id,
    old = readState(db, key);
  if (old && approvalSchema.parse(old).requestId === input.requestId)
    return db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get()!;
  const workspace = await loadConfig();
  const platforms = workspace.platforms,
    config = await loadPublishingConfig(platforms),
    data = publishingData(db);
  const batch = data.batches.find((b) => b.id === id),
    task = readPublishingTask(db, id),
    run = readUploadRun(db, id);
  if (
    !batch ||
    batch.abandonedAt ||
    batch.revision !== input.expectedRevision ||
    !task?.browser ||
    !run ||
    !['ready', 'attention'].includes(task.status)
  )
    throw Error('任务已变化，请重新查看审核页');
  if (publishMaterialKey(batch.draft, data, config) !== input.materials) throw Error('审核材料已经变化');
  const ready = readyPublishReceipts(
    id,
    batch.draft,
    data,
    config,
    platforms,
    Date.now(),
    workspace.parameters.publishUploadExpiryHours,
  );
  if (input.receipts.some((r) => !ready.some((v) => v.id === r.id && v.revision === r.expectedRevision)))
    throw Error('只能发布本批已审核且未过期的上传');
  if ((await fingerprint(run.video)).sha256 !== run.sha256) throw Error('原视频内容已变化，请核对上传版本');
  const next = {
    ...task,
    token: randomUUID(),
    status: 'running' as const,
    operation: 'publish' as const,
    process: null,
    reason: null,
    checkpoint: '核对审核版本，准备发布',
  };
  db.db.transaction(() => {
    const live = db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get();
    if (live?.revision !== input.expectedRevision || readPublishingTask(db, id)?.status !== task.status)
      throw Error('任务已更新');
    writeState(db, key, {
      requestId: input.requestId,
      receiptIds: input.receipts.map((r) => r.id),
      approvedAt: new Date().toISOString(),
      materials: input.materials,
    });
    writePublishingTask(db, next);
    db.db
      .update(publishRecords)
      .set({ revision: batch.revision + 1, state: 'running', updatedAt: new Date().toISOString() })
      .where(eq(publishRecords.id, id))
      .run();
  });
  try {
    await launchPublishingUpload(db, next);
  } catch (e) {
    const current = readPublishingTask(db, id);
    if (current?.token === next.token)
      writePublishingTask(db, {
        ...current,
        status: 'interrupted',
        reason: e instanceof Error ? e.message : '启动失败',
      });
    throw e;
  }
  return db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get()!;
}
export async function runPublishingSubmit(db: WorkspaceDatabase, id: string, token: string) {
  const active = () => {
    const t = readPublishingTask(db, id);
    if (!t || t.token !== token || t.status !== 'running') throw Error('发布任务已停止');
    return t;
  };
  try {
    for (let i = 0; i < 100 && !active().process; i++) await new Promise((r) => setTimeout(r, 50));
    if (active().process?.pid !== process.pid) throw Error('进程登记未完成');
    if (active().browser?.pausedByTask) {
      await resumePublishingBrowser(active().browser!);
      const t = active();
      writePublishingTask(db, { ...t, browser: { ...t.browser!, pausedByTask: false } });
    }
    const run = readUploadRun(db, id),
      approval = approvalSchema.parse(readState(db, 'publishing-approval:' + id));
    if (!run || !active().browser) throw Error('原上传页面不存在，未重新上传');
    const cfg = await publishingBrowserConfig(),
      judge = new CodexJudgment();
    for (const receiptId of approval.receiptIds) {
      active();
      const receipt = db.db.select().from(publishReceipts).where(eq(publishReceipts.id, receiptId)).get();
      if (!receipt || receipt.batchId !== id || ['published', 'pending_review'].includes(receipt.status)) continue;
      const item = run.platforms.find((p) => p.id === receipt.platformId),
        platform = cfg.platforms.find((p) => p.id === receipt.platformId);
      if (!item?.page || !platform) throw Error('上传页面记录不完整');
      const page = { spaceId: active().browser!.spaceId, label: item.page };
      try {
        if (receipt.status === 'ready') {
          const account = { spaceId: page.spaceId, label: 'p1' };
          await navigatePublishing(account, platform.home);
          await waitPublishingAccount(account, platform);
          const identity = await judge.read(
            z.object({ name: z.string().nullable(), id: z.string().nullable() }),
            `识别当前登录账号区的真实名称与ID，不能从目标链接猜测。${JSON.stringify(await publishingObservation(account))}`,
          );
          if (
            !platform.accountNames.includes(identity.name?.trim().replace(/\(/g, '（').replace(/\)/g, '）') ?? '') ||
            identity.id !== platform.accountId
          )
            throw Error('当前账号与审核账号不一致或无法核实');
          const file = path.resolve('data/jobs/publishing', id, platform.id + '-before-submit.png');
          await screenshotPublishing(page, file);
          const check = await judge.read(
            z.object({ matches: z.boolean(), ready: z.boolean(), reason: z.string() }),
            `检查当前待发布版本与已审核资料完全一致，标题、话题、封面及声明。尚未提交且上传已完成才ready=true。未知或页面不完整返回false。审核资料:${JSON.stringify(item.copy)} 当前页面:${JSON.stringify(await publishingObservation(page))}`,
            [file, ...platform.coverRatios.map((r) => run.covers[r])],
          );
          if (!check.matches || !check.ready) throw Error('发布前核对未通过：' + check.reason);
          active();
          // The durable intent precedes the one irreversible click. Recovery never clicks again.
          db.db
            .update(publishReceipts)
            .set({
              status: 'submitting',
              revision: receipt.revision + 1,
              safeToRetry: false,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(publishReceipts.id, receipt.id))
            .run();
          if (platform.id === 'youtube') {
            await publishingPageCall(
              page,
              `let s=await p.snapshot({scope:'full_page'});if(!s.includes('text "保存或发布"'))await p.click('text="公开范围" >> nth=0');await p.click('[role=radio][name="PUBLIC"]');s=await p.snapshot();const line=s.split('\\n').find(l=>/button "(发布|保存)"/.test(l));if(!line)throw Error('发布按钮未识别');await p.click('@'+line.match(/ref=([0-9]+)/)[1]);console.log('WORKSPACE_RESULT:true');`,
            );
          } else {
            const label = platform.id === 'bilibili' ? '立即投稿' : '发布';
            await publishingPageCall(
              page,
              `await p.click(${JSON.stringify('text=' + JSON.stringify(label))});console.log('WORKSPACE_RESULT:true');`,
            );
          }
        }
        active();
        const observation = await publishingObservation(page),
          file = path.resolve('data/jobs/publishing', id, platform.id + '-submit-result.png');
        await screenshotPublishing(page, file);
        const result = await judge.read(
          z.object({
            status: z.enum(['published', 'pending_review', 'unknown']),
            postId: z.string().nullable(),
            url: z.string().nullable(),
            evidence: z.string(),
          }),
          `只核验当前作品的提交结果，必须有可见成功页或对应标题的后台条目；按钮点击不证明成功。审核中为pending_review，明确公开/发布成功为published，否则unknown。不得把历史作品或浏览器地址当本片回执。当前标题:${JSON.stringify(item.copy.title)} 页面:${JSON.stringify(observation)}`,
          [file],
        );
        active();
        db.db
          .update(publishReceipts)
          .set({
            status: result.status,
            platformPostId: result.postId,
            url: result.url,
            publishedAt: result.status === 'published' ? new Date().toISOString() : null,
            reason: result.evidence,
            safeToRetry: false,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(publishReceipts.id, receipt.id))
          .run();
      } catch (e) {
        active();
        db.db
          .update(publishReceipts)
          .set({
            status: 'unknown',
            reason: e instanceof Error ? e.message : '发布结果待核对',
            safeToRetry: false,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(publishReceipts.id, receipt.id))
          .run();
        if (e instanceof Error && /控制权|ego|浏览器操作超时/.test(e.message)) throw e;
      }
    }
    const task = active();
    writePublishingTask(db, {
      ...task,
      status: 'attention',
      process: null,
      checkpoint: '提交检查结束，请查看逐平台回执',
      reason: null,
    });
    db.db
      .update(publishRecords)
      .set({ state: 'finished', revision: sql`${publishRecords.revision} + 1`, updatedAt: new Date().toISOString() })
      .where(eq(publishRecords.id, id))
      .run();
  } catch (e) {
    const task = readPublishingTask(db, id);
    if (task?.token === token && task.status === 'running')
      writePublishingTask(db, {
        ...task,
        status: 'interrupted',
        process: null,
        reason: e instanceof Error ? e.message : '发布中断',
      });
  }
}
