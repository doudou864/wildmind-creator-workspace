import { throwIfCollectionCancelled, CollectionCancelled, collectionSignal } from './cancellation.ts';
import { existingCollectionSpace } from '../browser/collection-space.ts';
import { collectPlatformInbox } from '../collectors/platform-inbox.ts';
import { refreshReviews } from '../lib/review-store.ts';
import { loadConfig } from '../lib/config.ts';
import { collectYoutube } from '../collectors/youtube/collector.ts';
import { collectChannels } from '../collectors/channels/collector.ts';
import { telemetry } from './telemetry.ts';
import { mkdir } from 'node:fs/promises';
import { acquireJobLock } from './lock.ts';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { openDatabase } from '../db/database.ts';
import { accounts, crawlLogs } from '../db/schema.ts';
import { EgoBrowser, runEgo, collectionPage } from '../browser/ego.ts';
import { CollectionSession, AttentionRequired } from '../browser/collection-session.ts';
import { loadBrowserConfig } from '../browser/config.ts';
import { confirmationDeadline, pause, loadBrowserPolicy, randomBetween } from '../browser/policy.ts';
import { CodexJudgment } from '../ai/structured.ts';
import { loadDouyinConfig } from '../collectors/douyin/config.ts';
import { collectXiaohongshu } from '../collectors/xiaohongshu/collector.ts';
import { collectBilibili } from '../collectors/bilibili/collector.ts';
import { collectDouyin } from '../collectors/douyin/collector.ts';
import { readState, writeState } from '../collectors/state.ts';
import { startCrawl, finishCrawl } from './crawl-log.ts';
import { requireAttention, notifyAttention, pendingAttention, resolveAttention } from './attention.ts';
import { checkConfirmations } from './confirmations.ts';
import { loadSchedule, scheduleForDay, dueSlot, shanghaiDate, platformSchedule } from './schedule.ts';
export async function runCollection(
  mode: 'manual' | 'scheduled' | 'resume',
  spaceOverride?: number,
  selectedPlatform?: string,
) {
  if (!selectedPlatform || !(await loadSchedule()).platforms.includes(selectedPlatform))
    throw Error('每个采集任务必须指定配置中的一个平台');
  const pausedKey = `browser:paused:${selectedPlatform}`;
  const retryKey = `browser:retry-space:${selectedPlatform}`;
  const errorKey = `collection:last-error:${selectedPlatform}`;
  await mkdir('data/jobs', { recursive: true, mode: 0o700 });
  const release = await acquireJobLock(`data/jobs/collect-${selectedPlatform}.pid`);
  if (!release) {
    console.log('已有采集任务在运行，本次退出');
    return;
  }
  const database = openDatabase();
  let activeSpace: number | undefined;
  let keepForConfirmation = false;
  let browserFailed = false;
  let collectionFailed = false;
  try {
    for (const unfinished of database.db
      .select()
      .from(crawlLogs)
      .where(and(eq(crawlLogs.status, 'running'), eq(crawlLogs.platformId, selectedPlatform)))
      .all()) {
      await finishCrawl(database, unfinished.id, {
        status: 'failed',
        reason: '上次采集进程中断，等待下一次重试',
        archivePaths: unfinished.archivePaths,
      });
    }
    if (mode === 'scheduled' && (readState(database, pausedKey) ?? readState(database, 'browser:paused'))?.paused)
      return;
    const schedule = await loadSchedule();
    if (selectedPlatform && !schedule.platforms.includes(selectedPlatform)) throw Error('平台不在采集配置中');
    const collectors = new Map<string, (...args: Parameters<typeof collectDouyin>) => Promise<object>>([
      [(await loadDouyinConfig()).platformId, collectDouyin],
      ['bilibili', collectBilibili],
      ['xiaohongshu', collectXiaohongshu],
      ['channels', collectChannels],
      ['youtube', collectYoutube],
    ]);
    if (mode === 'manual') {
      writeState(database, `${selectedPlatform}:list-stage`, {});
      writeState(database, `${selectedPlatform}:detail-stage`, {});
    }
    const now = new Date();
    const date = shanghaiDate(now);
    const key = `schedule:${date}:${selectedPlatform}`;
    // Keep the same daily random window for the batch; only retry/result state is per platform.
    const scheduleRelease = await acquireJobLock('data/jobs/schedule-choice.pid');
    let chosen = readState(database, `schedule:${date}`)?.chosen;
    if (scheduleRelease) {
      try {
        chosen = readState(database, `schedule:${date}`)?.chosen ?? scheduleForDay(schedule.start, schedule.end);
        if (!readState(database, `schedule:${date}`)) writeState(database, `schedule:${date}`, { chosen });
      } finally {
        await scheduleRelease();
      }
    }
    if (chosen === undefined) return; // another worker is choosing; the next poll will resume

    const state =
      readState(database, key) ??
      platformSchedule(readState(database, `schedule:${date}`), Number(chosen), selectedPlatform);
    writeState(database, key, state);
    // Poll only confirmation tasks, never click the login button repeatedly.
    await checkConfirmations(
      database,
      async (platformId, spaceId, page) => {
        database.db
          .update(accounts)
          .set({
            loginState: 'logged_in',
            reason: null,
            checkedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(accounts.platformId, platformId))
          .run();
        if (schedule.platforms.includes(platformId)) {
          const collector = collectors.get(platformId);
          if (collector) {
            const paths: string[] = [];
            const id = startCrawl(database, platformId);
            try {
              await collector(database, new CollectionSession(spaceId, page), new CodexJudgment(), paths);
              await collectPlatformInbox(
                database,
                platformId,
                new CollectionSession(spaceId, page),
                new CodexJudgment(),
                paths,
              );
              await finishCrawl(database, id, { status: 'success', archivePaths: paths });
              const current = readState(database, key) ?? state;
              const prior = Array.isArray(current.successfulPlatforms) ? (current.successfulPlatforms as string[]) : [];
              writeState(database, key, { ...current, successfulPlatforms: [...new Set([...prior, platformId])] });
            } catch (error) {
              await finishCrawl(database, id, {
                status: 'failed',
                reason: error instanceof Error ? error.message : '恢复采集失败',
                archivePaths: paths,
              });
              throw error;
            }
          }
        } else console.log(`${platformId}：已检测到登录成功；该平台采集器按 ROADMAP 第3步接入`);
      },
      undefined,
      undefined,
      selectedPlatform,
    );
    const attempted = Array.isArray(state.attempted) ? (state.attempted as string[]) : [];
    const slot =
      mode === 'scheduled' ? dueSlot(now, Number(state.chosen), schedule.retries, attempted, !!state.succeeded) : mode;
    if (!slot) return;
    writeState(database, errorKey, {});
    const pending = pendingAttention(database).filter(
      (x) => x.platformId === selectedPlatform && x.kind !== 'capacity',
    );
    const refreshed = readState(database, key) ?? state;
    const successful = new Set(
      Array.isArray(refreshed.successfulPlatforms) ? (refreshed.successfulPlatforms as string[]) : [],
    );
    const candidates =
      mode === 'resume'
        ? [...new Set(pending.filter((x) => x.kind !== 'confirmation').map((x) => x.platformId))]
        : schedule.platforms.filter((id) =>
            mode === 'manual'
              ? !pending.some((x) => x.platformId === id && x.kind === 'confirmation')
              : !pending.some((x) => x.platformId === id) && !successful.has(id),
          );
    const ids = candidates.filter((id) => !selectedPlatform || id === selectedPlatform);
    const platformConfig = await loadBrowserConfig();
    ids.sort(
      (a, b) =>
        Number(!!platformConfig.find((p) => p.id === a)?.confirmation) -
        Number(!!platformConfig.find((p) => p.id === b)?.confirmation),
    );
    if (!ids.length) {
      if (mode !== 'scheduled') throw Error('所选平台需要先处理登录或浏览器确认，请查看待处理原因');
      return;
    }
    if (mode === 'scheduled')
      writeState(database, key, {
        ...state,
        attempted: [...new Set([...attempted, ...(slot === 'main' ? [] : ['main']), slot])],
      });
    const resumeSpace =
      mode === 'resume' ? pending.find((item) => ids.includes(item.platformId) && item.spaceId)?.spaceId : undefined;
    if (resumeSpace) {
      await runEgo(`const t=await takeOverTaskSpace(${resumeSpace});console.log('WORKSPACE_RESULT:true');`);
      writeState(database, pausedKey, { paused: false });
    }
    const cachedSpace = readState(database, retryKey)?.id as number | undefined;
    const retrySpace = cachedSpace ? await existingCollectionSpace(cachedSpace) : undefined;
    activeSpace =
      spaceOverride ??
      resumeSpace ??
      retrySpace ??
      ((await runEgo(
        `const t=await taskSpace(${JSON.stringify('工作台采集 ' + selectedPlatform + ' ' + randomUUID())});console.log('WORKSPACE_RESULT:'+JSON.stringify(t.spaceId));`,
      )) as number);
    // A pending login owns its tab until confirmation/expiry; retries use a different tab in the same space.
    const reserved = pendingAttention(database)
      .filter((item) => item.spaceId === activeSpace && item.page)
      .map((item) => item.page!);
    const activePage = await collectionPage(activeSpace, reserved);
    keepForConfirmation = reserved.length > 0;
    const browser = new EgoBrowser(process.cwd(), undefined, activeSpace, activePage);
    let allSucceeded = true;
    for (const [index, id] of ids.entries()) {
      if (index) await pause(randomBetween((await loadBrowserPolicy()).platformDelayMs));
      const crawlId = startCrawl(database, id);
      telemetry()!.delayed =
        mode === 'scheduled' && (Date.now() - Date.parse(date + 'T00:00:00+08:00')) / 60000 > Number(state.chosen) + 1;
      const paths: string[] = [];
      try {
        const [login] = await browser.checkLogins([id]);
        if (login.state === 'awaiting_confirmation') {
          const config = (await loadBrowserConfig()).find((p) => p.id === id)!;
          const existing = pendingAttention(database).find(
            (item) => item.platformId === id && item.kind === 'confirmation',
          );
          if (!existing) {
            await browser.requestConfirmation(id, activeSpace, activePage);
            requireAttention(database, {
              platformId: id,
              kind: 'confirmation',
              reason: config.confirmation!.message,
              deadline: confirmationDeadline(config.confirmation!.deadline),
              spaceId: activeSpace,
              page: activePage,
            });
          }
          keepForConfirmation ||= !existing || existing.spaceId === activeSpace;
          throw new AttentionRequired(config.confirmation!.message, 'login');
        }
        if (login.state === 'logged_out') throw new AttentionRequired(login.reason, 'login');
        if (login.reason.startsWith('需要处理：')) throw new AttentionRequired(login.reason, 'risk');
        if (login.state !== 'logged_in') throw new Error(login.reason);
        const collector = collectors.get(id);
        if (!collector) throw new Error('该平台采集器尚未接入，未伪造成功');
        throwIfCollectionCancelled();
        const result = await collector(
          database,
          new CollectionSession(activeSpace, activePage),
          new CodexJudgment(),
          paths,
        );
        await collectPlatformInbox(
          database,
          id,
          new CollectionSession(activeSpace, activePage),
          new CodexJudgment(),
          paths,
        );
        throwIfCollectionCancelled();
        refreshReviews(database, await loadConfig());
        await finishCrawl(database, crawlId, { status: 'success', archivePaths: paths });
        resolveAttention(database, id);
        successful.add(id);
        writeState(database, key, { ...readState(database, key), successfulPlatforms: [...successful] });
        console.log(JSON.stringify({ platform: id, status: 'success', ...result }));
      } catch (error) {
        allSucceeded = false;
        collectionFailed = true;
        writeState(database, retryKey, { id: activeSpace });
        const cancelled = error instanceof CollectionCancelled || collectionSignal()?.aborted;
        const reason = cancelled ? '已停止本次采集' : error instanceof Error ? error.message : '采集失败';
        if (error instanceof AttentionRequired) telemetry()!.attention = true;
        if (
          error instanceof AttentionRequired &&
          !pendingAttention(database).some((item) => item.platformId === id && item.kind === 'confirmation')
        )
          requireAttention(database, {
            platformId: id,
            kind: error.kind,
            reason,
            spaceId: activeSpace,
            page: activePage,
          });
        await finishCrawl(database, crawlId, { status: 'failed', reason, archivePaths: paths });
        console.error(`${id}：${reason}`);
        if (cancelled) break;
        if (/控制权|ego 操作失败|浏览器操作超时/.test(reason)) {
          browserFailed = true;
          requireAttention(database, { platformId: id, kind: 'risk', reason, spaceId: activeSpace, page: activePage });
          writeState(database, pausedKey, { paused: true });
          break;
        }
      }
    }
    if (allSucceeded) {
      if (mode !== 'scheduled') writeState(database, pausedKey, { paused: false });
      writeState(database, retryKey, {});
      if (successful.has(selectedPlatform)) writeState(database, key, { ...readState(database, key), succeeded: true });
    }
    if (
      !browserFailed &&
      !keepForConfirmation &&
      pendingAttention(database).some((item) => item.spaceId === activeSpace)
    ) {
      await runEgo(`const t=await taskSpace(${activeSpace});await t.handOff();console.log('WORKSPACE_RESULT:true');`);
      keepForConfirmation = true;
    }
    await notifyAttention(database);
    if (!allSucceeded && mode !== 'scheduled') process.exitCode = 1;
  } catch (error) {
    writeState(database, errorKey, {
      reason: error instanceof Error ? error.message : '采集启动失败',
      at: new Date().toISOString(),
      platform: selectedPlatform ?? 'all',
    });
    throw error;
  } finally {
    try {
      if (activeSpace && !spaceOverride && !keepForConfirmation && !browserFailed && !collectionFailed)
        await runEgo(
          `const t=await taskSpace(${activeSpace});await t.finish({keep:[]});console.log('WORKSPACE_RESULT:true');`,
        );
    } finally {
      database.sqlite.close();
      await release();
    }
  }
}
