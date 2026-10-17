import { captureAccountExtras } from './extras.ts';
import { captureMonthly } from '../monthly.ts';
import { addDailyNet } from './account.ts';
import { requireCoreMetrics } from '../validate.ts';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import type { Judgment } from '../../ai/structured.ts';
import { loadConfig } from '../../lib/config.ts';
import { ageInDays, detailCheckpoints, sinceStartDate, withinRecentWindow } from '../../core/collection.ts';
import {
  postKey,
  metricFor,
  prepareAssociations,
  persistCollection,
  type CapturedReading,
  type CollectedPost,
} from '../storage.ts';
import { screenshotReading } from '../recognition.ts';
import { readState, writeState } from '../state.ts';
export async function collectXiaohongshu(
  database: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      platformId: z.string(),
      listUrl: z.url(),
      fansUrl: z.url(),
      rowSelector: z.string(),
      listReady: z.string(),
      detailSelector: z.string(),
      coreTab: z.string(),
      sourcesTab: z.string(),
      listScroll: z.string(),
      detailScroll: z.string(),
      mainScroll: z.string(),
      chart: z.string(),
      chartRightInset: z.number(),
      fansMetrics: z.array(z.string()),
      viewport: z.object({ width: z.number(), height: z.number() }),
      maxScreens: z.number(),
      detailCheckpoints: z.array(z.number()),
      diagnosticTabs: z.array(z.object({ selector: z.string(), metric: z.string() })),
      requiredDetailMetrics: z.array(z.string()),
      matchWindowDays: z.number(),
      historyRange: z.tuple([z.number(), z.number()]),
      aliases: z.record(z.string(), z.string()),
      accountAliases: z.record(z.string(), z.string()),
    })
    .parse(parse(await readFile('config/xiaohongshu.yaml', 'utf8')));
  const workspace = await loadConfig(),
    now = new Date();
  const date = shanghaiDate(now);
  const yesterday = shanghaiDate(new Date(now.getTime() - 86400000));
  const folder = `data/captures/${cfg.platformId}/${date}/${randomUUID()}`;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const readings: CapturedReading[] = [];
  const incoming: CollectedPost[] = [];
  const completed: Record<string, number[]> = {};
  let sequence = 0;
  session.viewport = cfg.viewport;
  const allowed = workspace.metrics
    .filter((m) =>
      m.bindings.some(
        (b) => b.platformId === cfg.platformId && b.status === 'confirmed' && ['core', 'secondary'].includes(b.level),
      ),
    )
    .map((m) => ({ name: m.name, scope: m.scope }));
  async function recognize(
    page: CollectionSession,
    kind: CapturedReading['kind'],
    prompt: string,
    post?: CollectedPost,
    chart = false,
  ) {
    const file = `${folder}/${String(sequence++).padStart(3, '0')}-${kind}.png`;
    if (chart) await page.captureChartTip(cfg.chart, cfg.chartRightInset, file);
    else await page.capture(file);
    paths.push(file);
    const result = await judgment.read(
      screenshotReading,
      `只看截图，原数字保留单位，未知为null，禁止猜值。允许指标${JSON.stringify(allowed)}。来源比例按“视频推荐来源占比/搜索来源占比/首页推荐来源占比/其他来源占比”，同类中位数加“同类中位数”前缀。不要将周总量当日数据。${prompt}`,
      [file],
    );
    if (result.status !== 'ok') throw new Error(result.reason ?? '截图识别失败');
    if (kind === 'account') {
      result.posts = [];
      if (result.account.dataDate !== yesterday) throw new Error('小红书单日提示日期不符，禁止使用七日合计');
    } else {
      result.account = { dataDate: null, metrics: [] };
      if (post)
        for (const item of result.posts) {
          item.title = post.title;
          item.publishedAt = post.publishedAt;
          item.form = post.form;
        }
    }
    const capture = {
      sourcePath: file,
      capturedAt: new Date().toISOString(),
      kind,
      postKey: post?.key,
      reading: result,
    };
    readings.push(capture);
    const json = file.replace('.png', '.json');
    await writeFile(json, JSON.stringify(capture));
    paths.push(json);
    return capture;
  }
  await session.navigate(cfg.listUrl, cfg.listReady);
  let observation = await session.inspect(cfg.platformId, cfg.listScroll);
  const count = observation.text.match(/共\s*(\d+)\s*条，\s*(\d+)\s*页/);
  if (!count || Number(count[2]) !== 1) throw new Error('笔记列表超过一页或分页变化，需核对翻页后再采集，不能漏记');
  const metadata = await session.run<{ title: string; publishedAt: string; video: boolean }[]>(
    `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(selector=>Array.from(document.querySelectorAll(selector)).map(row=>{const text=row.querySelector('td')?.innerText??'';const [title,date]=text.split('\\n');return {title,video:!!row.querySelector('.play'),publishedAt:date?.replace('发布于','').replace(' ','T')+':00+08:00'};}),${JSON.stringify(cfg.rowSelector)})));`,
  );
  for (const item of metadata) {
    if (
      sinceStartDate(item.publishedAt, workspace.parameters.startDate, now) &&
      withinRecentWindow(item.publishedAt, now, workspace.parameters.recentWindow)
    ) {
      if (!item.video) throw new Error('小红书出现图文，需按第12步核验pending指标后接入');
      incoming.push({ ...item, key: postKey(cfg.platformId, item.title, item.publishedAt), form: '视频' });
    }
  }
  if (Number(count[1]) !== metadata.length) throw new Error('列表条数与已读取元数据不符');
  for (let segment = 0; segment < cfg.maxScreens; segment++) {
    const state = await session.inspect(cfg.platformId, cfg.listScroll);
    const capture = await recognize(
      session,
      'list',
      `只提取可见完整行的数值。作品元数据${JSON.stringify(incoming)}。不凭标题推测数字，表格未显示的指标不输出。posts仅含上述作品，records/signals为空。`,
    );
    capture.reading.posts = capture.reading.posts.filter((p) => incoming.some((i) => i.title === p.title));
    for (const p of capture.reading.posts) {
      const meta = incoming.find((i) => i.title === p.title)!;
      p.publishedAt = meta.publishedAt;
      p.form = meta.form;
    }
    if (state.scroll.top + state.scroll.height >= state.scroll.total - 3) break;
    if (segment === cfg.maxScreens - 1) throw new Error('列表截图未完成');
    await session.scroll(cfg.listScroll);
  }
  for (const post of incoming) {
    const prior = readState(database, `checkpoints:${post.key}`);
    const due = detailCheckpoints(
      ageInDays(post.publishedAt, now),
      cfg.detailCheckpoints,
      Array.isArray(prior?.days) ? (prior.days as number[]) : [],
    );
    const missing = cfg.requiredDetailMetrics.some((label) => {
      const metric = metricFor(workspace, cfg.platformId, 'post', post.form, label, cfg.aliases);
      if (!metric) throw new Error(`详情指标配置未找到：${label}`);
      return !database.sqlite
        .prepare('SELECT 1 FROM post_snapshots WHERE post_id=? AND metric_id=? LIMIT 1')
        .get(post.key, metric.id);
    });
    if (!due.needed && !missing) continue;
    const index = metadata.findIndex((p) => p.title === post.title && p.publishedAt === post.publishedAt);
    const detail = await session.openPopup(`${cfg.detailSelector} >> nth=${index}`);
    await detail.settle('text="笔记数据详情"');
    await detail.inspect(cfg.platformId, cfg.detailScroll);
    if (due.needed) await recognize(detail, 'detail', '只记录本条作品的诊断文字和同类中位数。', post);
    for (const tab of cfg.diagnosticTabs) {
      await detail.click(tab.selector);
      await recognize(
        detail,
        'detail',
        `记录${tab.metric}及同类中位数${tab.metric}，以及当前诊断文字；超过多少同类作者不是中位数。`,
        post,
      );
    }
    await detail.click(cfg.coreTab);
    await recognize(
      detail,
      'detail',
      '提取核心数据，特别是2秒退出率和涨粉数。观看数卡片下的粉丝占比单独记为观看粉丝占比；其余指标取总量，不取粉丝子集。',
      post,
    );
    if (due.needed) {
      await detail.scroll(cfg.detailScroll);
      await recognize(detail, 'detail', '补充核心数据的互动指标；不读取观众画像。', post);
      await detail.click(cfg.sourcesTab);
      await recognize(detail, 'detail', '只补充观看来源，观众画像不采。', post);
    }
    await detail.close();
    completed[post.key] = due.due.length
      ? due.due
      : cfg.detailCheckpoints.filter((d) => d <= ageInDays(post.publishedAt, now));
  }
  session.viewport = undefined;
  await session.navigate(cfg.fansUrl, 'text="粉丝数据趋势"');
  for (const label of cfg.fansMetrics) {
    await session.click(`label:text-is("${label}")`);
    await session.inspect(cfg.platformId);
    await recognize(
      session,
      'account',
      `只取趋势图悬停提示中的${label}，日期必须为${yesterday}，不要顶部总数或近7天合计。其他数组为空。`,
      undefined,
      true,
    );
  }
  addDailyNet(readings, cfg.accountAliases);
  const extras = await captureAccountExtras(database, session, judgment, folder, paths, now);
  readings.push(...extras.readings);
  const monthly = await captureMonthly(database, cfg.platformId, session, judgment, folder, paths, now);
  readings.push(...monthly);
  requireCoreMetrics(
    workspace,
    cfg.platformId,
    incoming,
    readings,
    cfg.aliases,
    cfg.accountAliases,
    (post) => !!completed[post.key],
  );
  for (const post of incoming) {
    for (const label of cfg.requiredDetailMetrics) {
      const definition = metricFor(workspace, cfg.platformId, 'post', post.form, label, cfg.aliases)!;
      const captured = readings.some(
        (r) =>
          r.postKey === post.key &&
          r.reading.posts.some((p) =>
            p.metrics.some(
              (m) =>
                metricFor(workspace, cfg.platformId, 'post', post.form, m.label, cfg.aliases)?.id === definition.id,
            ),
          ),
      );
      const saved = database.sqlite
        .prepare('SELECT 1 FROM post_snapshots WHERE post_id=? AND metric_id=? LIMIT 1')
        .get(post.key, definition.id);
      if (!captured && !saved) throw new Error(`${post.title}详情指标缺失：${label}`);
    }
  }
  const decisions = await prepareAssociations(database, cfg.platformId, incoming, judgment, cfg.matchWindowDays);
  persistCollection(database, cfg.platformId, incoming, readings, decisions, workspace, {
    history: false,
    historyRange: cfg.historyRange,
    aliases: cfg.aliases,
    accountAliases: cfg.accountAliases,
    completed,
    now,
  });
  if (extras.monthly) writeState(database, `${cfg.platformId}:watching-month`, { month: date.slice(0, 7) });
  if (monthly.length) writeState(database, `${cfg.platformId}:audience-month`, { month: date.slice(0, 7) });
  return { posts: incoming.length, screenshots: sequence + monthly.length };
}
