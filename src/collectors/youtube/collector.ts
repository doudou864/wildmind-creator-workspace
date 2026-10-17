import { PageCoverage } from '../pagination.ts';
import { loadCapacity, checkCapacity } from '../capacity.ts';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import type { Judgment } from '../../ai/structured.ts';
import { loadConfig } from '../../lib/config.ts';
import { sinceStartDate, withinRecentWindow, normalizeDataDate } from '../../core/collection.ts';
import {
  postKey,
  prepareAssociations,
  persistCollection,
  metricFor,
  type CapturedReading,
  type CollectedPost,
} from '../storage.ts';
import { screenshotReading } from '../recognition.ts';
import { requireCoreMetrics } from '../validate.ts';
import { captureMonthly } from '../monthly.ts';
import { writeState } from '../state.ts';
import { durationSeconds, subscriberChange } from './values.ts';

export async function collectYoutube(
  database: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      platformId: z.string(),
      contentUrls: z.array(z.url()),
      contentReady: z.string(),
      nextPage: z.string(),
      rowSelector: z.string(),
      titleSelector: z.string(),
      dateSelector: z.string(),
      reportUrl: z.url(),
      reportReady: z.string(),
      reportScroll: z.string(),
      dashboardUrl: z.url(),
      dashboardReady: z.string(),
      viewport: z.object({ width: z.number(), height: z.number() }),
      maxScreens: z.number(),
      matchWindowDays: z.number(),
      historyRange: z.tuple([z.number(), z.number()]),
      aliases: z.record(z.string(), z.string()),
      accountAliases: z.record(z.string(), z.string()),
    })
    .parse(parse(await readFile('config/youtube.yaml', 'utf8')));
  const workspace = await loadConfig(),
    now = new Date(),
    today = shanghaiDate(now);
  const folder = `data/captures/${cfg.platformId}/${today}/${randomUUID()}`;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  session.viewport = cfg.viewport;
  const capacity = await loadCapacity();
  const metadata: { title: string; href: string; date: string }[] = [];
  for (const url of cfg.contentUrls) {
    await session.navigate(url, cfg.contentReady);
    const coverage = new PageCoverage();
    for (let pageIndex = 0; pageIndex < capacity.maxPages; pageIndex++) {
      const state = await session.inspect(cfg.platformId);
      const rows = await session.run<{ title: string; href: string; date: string }[]>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>Array.from(document.querySelectorAll(cfg.rowSelector)).map(row=>({title:row.querySelector(cfg.titleSelector)?.textContent?.trim()??'',href:row.querySelector(cfg.titleSelector)?.getAttribute('href')??'',date:row.querySelector(cfg.dateSelector)?.textContent?.trim()??''})),${JSON.stringify(cfg)})));`,
      );
      const count = state.text.match(/第\s*\d+\s*[-–]\s*(\d+)\s*条，共\s*(\d+)\s*条/);
      if (!count) throw new Error('YouTube列表总数无法确认');
      const done = coverage.add(
        rows.map((r) => r.href),
        Number(count[2]),
      );
      metadata.push(...rows);
      if (done) break;
      await session.click(cfg.nextPage);
    }
    coverage.finish();
  }
  const incoming: CollectedPost[] = [];
  for (const item of metadata) {
    const dateMatch = item.date.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    const idMatch = item.href.match(/\/video\/([^/]+)/);
    if (!dateMatch || !idMatch || !item.title) throw new Error('YouTube作品身份或发布日期无法确认');
    const publishedAt = normalizeDataDate(
      `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`,
    );
    if (
      sinceStartDate(publishedAt, workspace.parameters.startDate, now) &&
      withinRecentWindow(publishedAt, now, workspace.parameters.recentWindow)
    )
      incoming.push({
        title: item.title,
        publishedAt,
        platformPostId: idMatch[1],
        form: '视频',
        key: postKey(cfg.platformId, item.title, publishedAt, idMatch[1]),
      });
  }
  checkCapacity(database, cfg.platformId, incoming.length, capacity);
  if (!metadata.length) throw new Error('YouTube内容列表为空，需核验页面');
  const readings: CapturedReading[] = [];
  const allowed = workspace.metrics
    .filter(
      (m) =>
        m.kind === 'number' &&
        m.bindings.some((b) => b.platformId === cfg.platformId && ['core', 'secondary'].includes(b.level)),
    )
    .map((m) => m.name);
  await session.navigate(cfg.reportUrl, cfg.reportReady);
  for (let i = 0; i < cfg.maxScreens; i++) {
    const state = await session.inspect(cfg.platformId, cfg.reportScroll);
    const file = `${folder}/report-${i}.png`;
    await session.capture(file);
    paths.push(file);
    const reading = await judgment.read(
      screenshotReading,
      `只看可见表格完整行，提取这几条作品的指标，不取合计、不取比例小字。允许指标${JSON.stringify(allowed)}；元数据${JSON.stringify(incoming)}。日期沿用元数据。平均观看时长保留原始分:秒，不心算。破折号留null；当前截图没有目标行则posts为空,status为ok。account/records/signals为空。`,
      [file],
    );
    if (reading.status !== 'ok') throw new Error(reading.reason ?? 'YouTube截图识别失败');
    reading.account = { dataDate: null, metrics: [] };
    reading.records = [];
    reading.signals = [];
    for (const post of reading.posts) {
      const match = incoming.filter((p) => p.title === post.title);
      if (match.length !== 1) throw new Error('YouTube截图作品标题匹配不唯一');
      post.publishedAt = match[0].publishedAt;
      post.form = match[0].form;
      for (const metric of post.metrics)
        if (metricFor(workspace, cfg.platformId, 'post', '视频', metric.label, cfg.aliases)?.name === '平均观看时长')
          metric.raw = durationSeconds(metric.raw);
    }
    const capture: CapturedReading = { sourcePath: file, capturedAt: new Date().toISOString(), kind: 'list', reading };
    readings.push(capture);
    const json = file.replace('.png', '.json');
    await writeFile(json, JSON.stringify(capture));
    paths.push(json);
    if (state.scroll.top + state.scroll.height >= state.scroll.total - 3) break;
    if (i === cfg.maxScreens - 1) throw new Error('YouTube报表未读完');
    await session.scroll(cfg.reportScroll);
  }
  await session.navigate(cfg.dashboardUrl, cfg.dashboardReady);
  await session.inspect(cfg.platformId);
  const file = `${folder}/account.png`;
  await session.capture(file);
  paths.push(file);
  const reading = await judgment.read(
    screenshotReading,
    `只识别当前订阅者总数，标签粉丝总数；账号日期为当前北京时间${today}。不要近28天净增，不要月度观众数。posts/records/signals为空。`,
    [file],
  );
  if (reading.status !== 'ok' || reading.account.dataDate !== today || reading.account.metrics.length !== 1)
    throw new Error('YouTube订阅总数识别失败');
  const total = reading.account.metrics[0];
  const metric = metricFor(workspace, cfg.platformId, 'account', 'all', total.label, cfg.accountAliases);
  if (!metric) throw new Error('YouTube订阅总数标签未识别');
  const yesterday = shanghaiDate(new Date(now.getTime() - 86400000));
  const previous = database.sqlite
    .prepare('SELECT value,precision FROM account_daily WHERE platform_id=? AND data_date=? AND metric_id=?')
    .get(cfg.platformId, yesterday, metric.id) as { value: number | null; precision: string } | undefined;
  reading.account.metrics.push({ label: '粉丝净增', raw: subscriberChange(total.raw, previous) });
  const capture: CapturedReading = { sourcePath: file, capturedAt: new Date().toISOString(), kind: 'account', reading };
  readings.push(capture);
  const json = file.replace('.png', '.json');
  await writeFile(json, JSON.stringify(capture));
  paths.push(json);
  const monthly = await captureMonthly(database, cfg.platformId, session, judgment, folder, paths, now);
  readings.push(...monthly);
  for (const post of incoming) {
    const seen = new Set(
      readings.flatMap((r) =>
        r.reading.posts
          .filter((p) => p.title === post.title)
          .flatMap((p) =>
            p.metrics.map((m) => metricFor(workspace, cfg.platformId, 'post', post.form, m.label, cfg.aliases)?.id),
          ),
      ),
    );
    const missing = workspace.metrics.filter(
      (m) =>
        m.scope === 'post' &&
        m.kind === 'number' &&
        m.bindings.some(
          (b) => b.platformId === cfg.platformId && ['core', 'secondary'].includes(b.level) && b.status === 'confirmed',
        ) &&
        !seen.has(m.id),
    );
    if (missing.length) throw new Error(`${post.title}报表指标缺失：${missing.map((m) => m.name).join('、')}`);
  }
  requireCoreMetrics(workspace, cfg.platformId, incoming, readings, cfg.aliases, cfg.accountAliases);
  const decisions = await prepareAssociations(database, cfg.platformId, incoming, judgment, cfg.matchWindowDays);
  persistCollection(database, cfg.platformId, incoming, readings, decisions, workspace, {
    history: false,
    historyRange: cfg.historyRange,
    aliases: cfg.aliases,
    accountAliases: cfg.accountAliases,
    completed: {},
    now,
  });
  if (monthly.length) writeState(database, `${cfg.platformId}:audience-month`, { month: today.slice(0, 7) });
  return { posts: incoming.length, screenshots: readings.length };
}
