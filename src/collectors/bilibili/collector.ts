import { exportRecentPosts } from './export.ts';
import { loadCapacity, checkCapacity } from '../capacity.ts';
import { captureMonthly } from '../monthly.ts';
import { writeState } from '../state.ts';
import { bilibiliMetric } from './csv.ts';
import { requireCoreMetrics } from '../validate.ts';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
import { type WorkspaceDatabase } from '../../db/database.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { type Judgment } from '../../ai/structured.ts';
import { loadConfig } from '../../lib/config.ts';
import { normalizeDataDate } from '../../core/collection.ts';
import { chinesePublishedAt } from '../csv.ts';
import { postKey, prepareAssociations, persistCollection, type CapturedReading } from '../storage.ts';
import { screenshotReading } from '../recognition.ts';
export async function collectBilibili(
  database: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      platformId: z.string(),
      url: z.url(),
      analysis: z.string(),
      compare: z.string(),
      export: z.string(),
      week: z.string(),
      yesterday: z.string(),
      selection: z.object({
        choose: z.string(),
        card: z.string(),
        title: z.string(),
        date: z.string(),
        scroll: z.string(),
        confirm: z.string(),
        batchSize: z.number().int().positive(),
        maxSegments: z.number().int().positive(),
        readyTimeoutMs: z.number().int().positive(),
      }),
      matchWindowDays: z.number(),
      historyRange: z.tuple([z.number(), z.number()]),
      aliases: z.record(z.string(), z.string()),
      accountAliases: z.record(z.string(), z.string()),
    })
    .parse(parse(await readFile('config/bilibili.yaml', 'utf8')));
  const workspace = await loadConfig();
  const now = new Date();
  const folder = `data/captures/${cfg.platformId}/${shanghaiDate(now)}/${randomUUID()}`;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await session.navigate(cfg.url, cfg.analysis);
  await session.inspect(cfg.platformId);
  await session.click(cfg.analysis);
  await session.click(cfg.compare);
  await session.inspect(cfg.platformId);
  const capacity = await loadCapacity();
  const rows = await exportRecentPosts(
    session,
    cfg.platformId,
    cfg.selection,
    cfg.export,
    folder,
    paths,
    workspace.parameters.startDate,
    workspace.parameters.recentWindow,
    now,
    (count) => checkCapacity(database, cfg.platformId, count, capacity),
  );
  const eligible = rows.map(({ row, sourcePath }) => ({
    row,
    sourcePath,
    publishedAt: chinesePublishedAt(row['发布时间']),
  }));
  const incoming = eligible.map(({ row, publishedAt }) => ({
    title: row['视频标题'],
    publishedAt,
    form: '视频' as const,
    key: postKey(cfg.platformId, row['视频标题'], publishedAt),
  }));
  const readings: CapturedReading[] = [...new Set(eligible.map((p) => p.sourcePath))].map((sourcePath) => ({
    sourcePath,
    capturedAt: now.toISOString(),
    kind: 'list',
    reading: screenshotReading.parse({
      status: 'ok',
      reason: null,
      posts: eligible
        .filter((p) => p.sourcePath === sourcePath)
        .map(({ row, publishedAt }) => ({
          title: row['视频标题'],
          publishedAt,
          form: '视频',
          metrics: Object.entries(row)
            .filter(([label]) => !['视频标题', '发布时间'].includes(label))
            .map(([label, raw]) => bilibiliMetric(label, raw, cfg.aliases)),
        })),
      account: { dataDate: null, metrics: [] },
      records: [],
      signals: [],
    }),
  }));
  await session.navigate(cfg.url, cfg.week);
  await session.click(cfg.week);
  await session.click(cfg.yesterday);
  const observed = await session.inspect(cfg.platformId);
  const match = observed.text.match(/更新至(\d{1,2})月(\d{1,2})日/);
  if (!match) throw new Error('粉丝数据截止日期未知');
  let year = Number(shanghaiDate(now).slice(0, 4));
  const suffix = `-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  if (String(year) + suffix > shanghaiDate(now)) year--;
  const dataDate = normalizeDataDate(String(year) + suffix);
  const image = `${folder}/account.png`;
  await session.capture(image);
  paths.push(image);
  const account = await judgment.read(
    screenshotReading,
    `只识别昨日粉丝数据：粉丝总数、新增关注、净增粉丝、取消关注。不取小字增减箭头比较数。日期已核对${dataDate}。posts/records/signals为空，account.dataDate为该日期。数值保留单位。`,
    [image],
  );
  if (account.status !== 'ok' || account.account.metrics.length !== 4) throw new Error('B站粉丝截图识别失败或4项不全');
  if (account.account.dataDate !== dataDate) throw new Error('B站账号日期冲突');
  const json = image.replace('.png', '.json');
  await writeFile(json, JSON.stringify(account));
  paths.push(json);
  readings.push({ sourcePath: image, capturedAt: new Date().toISOString(), kind: 'account', reading: account });
  const monthly = await captureMonthly(database, cfg.platformId, session, judgment, folder, paths, now);
  readings.push(...monthly);
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
  if (monthly.length)
    writeState(database, `${cfg.platformId}:audience-month`, { month: shanghaiDate(now).slice(0, 7) });
  return { posts: incoming.length };
}
