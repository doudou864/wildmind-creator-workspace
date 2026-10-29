import { resumePublishingBrowser, pausePublishingBrowser } from '../browser/publishing-task.ts';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { assets, publishRecords, publishReceipts } from '../db/schema.ts';
import { readPublishingTask, writePublishingTask, publishingCheckpoint } from './publishing-tasks.ts';
import { readUploadRun, writeUploadRun } from './publishing-upload-state.ts';
import { prepareDirectPublishingSubmit, runPublishingSubmit } from './publishing-submit.ts';
import { fingerprint } from '../lib/local-videos.ts';
import { adaptUploadCopy } from './publishing-upload.ts';
import { CodexJudgment } from '../ai/structured.ts';
import { imageInfo } from '../lib/image-files.ts';
import { publishingData } from '../lib/publishing-store.ts';
import { loadPublishingConfig } from '../lib/publishing-config.ts';
import { loadConfig } from '../lib/config.ts';
import { platformMaterialKey } from '../lib/publishing-model.ts';
import {
  createPublishingSpace,
  newPublishingPage,
  navigatePublishing,
  waitPublishingAccount,
  publishingBrowserConfig,
  publishingObservation,
  beginVideoUpload,
  fillPublishingCopy,
  fillPublishingCovers,
  fillPublishingSettings,
  screenshotPublishing,
  publishingPageCall,
  publishingUploadComplete,
} from '../browser/publishing-runner.ts';

export async function runPublishingUpload(db: WorkspaceDatabase, id: string, token: string) {
  const active = () => {
    const t = readPublishingTask(db, id);
    if (!t || t.token !== token || t.status !== 'running') throw Error('任务已停止');
    return t;
  };
  const saveTask = (fields: Partial<ReturnType<typeof active>>) => {
    const t = active();
    writePublishingTask(db, { ...t, ...fields });
  };
  try {
    // The parent records the exact process identity before any browser side effect.
    for (let i = 0; i < 100 && !active().process; i++) await new Promise((r) => setTimeout(r, 50));
    if (active().process?.pid !== process.pid) throw Error('后台进程尚未登记，未操作浏览器');
    const run = readUploadRun(db, id);
    if (!run) throw Error('上传资料不存在');
    if ((await fingerprint(run.video)).sha256 !== run.sha256) throw Error('原视频内容已变化，未继续上传');
    const config = await publishingBrowserConfig(),
      judge = new CodexJudgment();
    if (active().browser?.pausedByTask) {
      await resumePublishingBrowser(active().browser!);
      saveTask({ browser: { ...active().browser!, pausedByTask: false } });
    }
    if (!active().browser) {
      const name = active().browserName ?? `上传 ${id} ${token}`;
      saveTask({ browserName: name });
      const browser = await createPublishingSpace(name);
      // Keep ownership visible even when pause races with space creation.
      const current = readPublishingTask(db, id);
      if (current?.token !== token) throw Error('浏览器所属任务已变化');
      writePublishingTask(db, { ...current, browser });
      active();
    }
    const browser = active().browser!;
    for (const item of run.platforms) {
      active();
      if (item.stage === 'ready') continue;
      const cfg = config.platforms.find((p) => p.id === item.id)!;
      const update = () => {
        active();
        writeUploadRun(db, id, run);
      };
      const checkpoint = (s: string) => {
        if (!publishingCheckpoint(db, id, token, `${cfg.name} · ${s}`)) throw Error('任务已暂停');
      };
      try {
        checkpoint('核对账号');
        // A separate inspection page prevents navigation from discarding uploaded form data.
        const accountPage = { spaceId: browser.spaceId, label: 'p1' };
        await navigatePublishing(accountPage, cfg.home);
        await waitPublishingAccount(accountPage, cfg);
        const observed = await publishingObservation(accountPage);
        const identity = await judge.read(
          z.object({ name: z.string().nullable(), id: z.string().nullable(), reason: z.string() }),
          `从当前已登录账号区识别当前账号名称和ID。不能把目标账号或外部链接当已登录身份；无证据返回null。页面：${JSON.stringify(observed)}`,
        );
        if (
          !cfg.accountNames.includes(identity.name?.trim().replace(/\(/g, '（').replace(/\)/g, '）') ?? '') ||
          identity.id !== cfg.accountId
        )
          throw Error('当前账号未核实：' + identity.reason);
        item.accountVerified = true;
        item.reason = null;
        update();
        if (!item.page) {
          item.page = await newPublishingPage(browser.spaceId);
          update();
        }
        const page = { spaceId: browser.spaceId, label: item.page };
        if (item.stage === 'account') {
          await navigatePublishing(page, cfg.uploadUrl ?? cfg.home);
          item.stage = 'upload';
          item.attempted = false;
          update();
        }
        if (item.stage === 'upload') {
          if (item.attempted) throw Error('上次上传动作结果待核对，未重新选择视频文件');
          checkpoint('发送视频');
          if ((await fingerprint(run.video)).sha256 !== run.sha256) throw Error('原视频内容已变化，未发送文件');
          active();
          item.attempted = true;
          update();
          await beginVideoUpload(page, cfg, run.video);
          item.stage = 'wait';
          item.attempted = false;
          update();
        }
        if (item.stage === 'wait') {
          checkpoint('等待平台上传处理');
          const until = Date.now() + config.uploadTimeoutMs;
          let complete = false;
          while (Date.now() < until) {
            active();
            const view = await publishingObservation(page);
            if (publishingUploadComplete(view.snapshot, cfg)) {
              complete = true;
              break;
            }
            await new Promise((r) => setTimeout(r, config.pollMs));
          }
          if (!complete) throw Error('平台尚未完成视频处理，可稍后继续核对，未重新上传');
          item.stage = 'copy';
          item.attempted = false;
          update();
        }
        if (item.stage === 'copy') {
          checkpoint('填写主题和话题');
          if (!item.copyPrepared) {
            await adaptUploadCopy(run, item.id);
            item.copyPrepared = true;
          }
          update();
          await fillPublishingCopy(page, cfg, item.copy);
          item.stage = 'covers';
          item.attempted = false;
          update();
        }
        if (item.stage === 'covers') {
          if (item.attempted) throw Error('封面编辑中断，请核对平台当前封面后继续；未盲目重复操作');
          checkpoint('设置封面');
          item.attempted = true;
          update();
          await fillPublishingCovers(page, cfg, run.covers);
          item.stage = 'settings';
          item.attempted = false;
          update();
        }
        if (item.stage === 'settings') {
          checkpoint('核对声明与设置');
          const facts = await judge.read(
            z.object({ aiGenerated: z.boolean().nullable(), category: z.string().nullable() }),
            `仅根据用户明确提供的主题识别是否声明AI生成。明确是返回true，明确非AI返回false，不知道返回null；不要将讨论AI等同于AI生成。另从以下候选分类中选一个匹配主题的分类，没有候选返回null：${JSON.stringify(cfg.categories)}。主题：${JSON.stringify(item.copy)}`,
          );
          await fillPublishingSettings(page, cfg, facts.aiGenerated, facts.category);
          item.stage = 'review';
          update();
        }
        if (item.stage === 'review') {
          checkpoint('核对上传页面');
          if (cfg.id === 'youtube')
            await publishingPageCall(
              page,
              `const s=await p.snapshot({scope:'full_page'});if(s.includes('button "显示高级设置"'))await p.click('loc=role:button[name="显示高级设置"]');console.log('WORKSPACE_RESULT:true');`,
            );
          await publishingPageCall(
            page,
            cfg.id === 'channels'
              ? `await p.evaluate(()=>Array.from(document.querySelectorAll('iframe')).forEach(f=>f.contentDocument?.querySelector('.input-editor')?.scrollIntoView({block:'center',behavior:'instant'})));console.log('WORKSPACE_RESULT:true');`
              : `await p.hover(${JSON.stringify(cfg.titleInput)});await p.mouse.wheel(0,-2000);console.log('WORKSPACE_RESULT:true');`,
          );
          const view = await publishingObservation(page),
            file = path.resolve('data/jobs/publishing', id, `${item.id}-review.png`);
          await screenshotPublishing(page, file);
          let watchEvidence: unknown = null;
          if (cfg.id === 'youtube') {
            const link = view.snapshot.match(/https:\/\/youtu\.be\/[a-zA-Z0-9_-]+/)?.[0];
            if (link) {
              await navigatePublishing(accountPage, link);
              if (item.copy.tags.length)
                await publishingPageCall(
                  accountPage,
                  `await p.waitForSelector('a[href*="/hashtag/"]',{timeout:15000});console.log('WORKSPACE_RESULT:true');`,
                );
              watchEvidence = await publishingObservation(accountPage);
            }
          }
          if (!publishingUploadComplete(view.snapshot, cfg))
            throw Error('平台尚未显示可审核的上传结果，请稍后继续核对');
          const review = await judge.read(
            z.object({
              titleMatches: z.boolean(),
              tagsApplied: z.boolean(),
              coversMatch: z.boolean(),
              settingsComplete: z.boolean(),
              notPublished: z.boolean(),
              reason: z.string(),
            }),
            `核对待发布页面。图1为当前页面，其余为指定封面。主题=${JSON.stringify(item.copy.title)} 标签=${JSON.stringify(item.copy.tags)}。上传可审核状态已由代码按本平台实测界面确认；只核对标题一致、话题实际成链接/独立标签、指定封面完整且保存、必要声明与必填项完整、尚未公开发布。缺少证据返回false，不能凭操作历史推断。页面快照：${JSON.stringify(view)}。私享观看页话题证据：${JSON.stringify(watchEvidence)}`,
            [file, ...cfg.coverRatios.map((r) => run.covers[r])],
          );
          if (
            !Object.entries(review)
              .filter(([k]) => k !== 'reason')
              .every(([, v]) => v === true)
          )
            throw Error('上传后待核对：' + review.reason);
          active();
          const templates = await loadPublishingConfig((await loadConfig()).platforms);
          const info = await imageInfo(file),
            assetId = randomUUID(),
            now = new Date().toISOString();
          db.db.transaction(() => {
            active();
            const batch = db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get()!;
            const draft = {
              ...batch.draft,
              settings: batch.draft.settings.map((s) =>
                s.platformId === item.id ? { ...s, ...item.copy, individuallyEdited: true } : s,
              ),
            };
            db.db
              .update(publishRecords)
              .set({ draft, revision: batch.revision + 1, updatedAt: now })
              .where(eq(publishRecords.id, id))
              .run();
            db.db
              .insert(assets)
              .values({
                id: assetId,
                familyId: assetId,
                contentId: draft.contentId,
                title: `${cfg.name} 上传审核`,
                purposeId: 'publishing-review',
                ratio: `${info.width}:${info.height}`,
                path: path.relative(process.cwd(), file),
                width: info.width,
                height: info.height,
                mime: info.mime,
                source: 'upload',
                prompt: '平台上传审核截图',
                version: 1,
                selected: false,
                createdAt: now,
                updatedAt: now,
              })
              .run();
            item.stage = 'ready';
            item.reviewObservation = view;
            update();
            db.db
              .update(publishReceipts)
              .set({
                status: 'ready',
                materials: platformMaterialKey(draft, item.id, publishingData(db), templates),
                title: item.copy.title,
                screenshotAssetId: assetId,
                uploadedAt: now,
                reason: run.publishAuthorization ? '已上传，将按本次授权发布' : '已上传，等待本人审核；尚未公开发布',
                safeToRetry: false,
                updatedAt: now,
              })
              .where(and(eq(publishReceipts.batchId, id), eq(publishReceipts.platformId, item.id)))
              .run();
          });
        }
      } catch (e) {
        active();
        item.reason = e instanceof Error ? e.message : '上传未完成';
        update();
        db.db
          .update(publishReceipts)
          .set({ status: 'unknown', reason: item.reason, safeToRetry: false, updatedAt: new Date().toISOString() })
          .where(and(eq(publishReceipts.batchId, id), eq(publishReceipts.platformId, item.id)))
          .run();
        // Browser control loss stops the entire run; ordinary account mismatch only stops that platform.
        if (/控制权|ego|浏览器操作超时|原浏览器工作区已关闭/.test(item.reason)) throw e;
      }
    }
    if (await prepareDirectPublishingSubmit(db, id, token)) {
      await runPublishingSubmit(db, id, token);
      return;
    }
    const ready = !run.publishAuthorization && run.platforms.every((p) => p.stage === 'ready');
    await pausePublishingBrowser(active().browser!);
    saveTask({ browser: { ...active().browser!, pausedByTask: true } });
    saveTask({
      status: ready ? 'ready' : 'attention',
      process: null,
      checkpoint: ready ? '上传完成，请查看截图后审核' : '部分平台需要处理',
      reason:
        run.platforms
          .filter((p) => p.reason)
          .map((p) => p.reason)
          .join('；') || (run.publishAuthorization ? '没有可继续提交的就绪平台，请查看逐平台回执' : null),
    });
    db.db
      .update(publishRecords)
      .set({ state: 'prepared', revision: sql`${publishRecords.revision} + 1`, updatedAt: new Date().toISOString() })
      .where(eq(publishRecords.id, id))
      .run();
  } catch (e) {
    const task = readPublishingTask(db, id);
    if (task?.token === token && task.status === 'running')
      writePublishingTask(db, {
        ...task,
        status: 'interrupted',
        process: null,
        reason: e instanceof Error ? e.message : '执行已中断',
      });
  }
}
