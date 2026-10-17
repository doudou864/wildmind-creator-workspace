import { captureMonthly } from '../monthly.ts';
import { writeState } from '../state.ts';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import type { Judgment } from '../../ai/structured.ts';
import { loadConfig } from '../../lib/config.ts';
import { sinceStartDate, withinRecentWindow } from '../../core/collection.ts';
import { parseCsv } from '../csv.ts';
import { channelAccountRows, exportDate } from './csv.ts';
import { postKey, prepareAssociations, persistCollection, type CapturedReading } from '../storage.ts';
import { requireCoreMetrics } from '../validate.ts';
export async function collectChannels(
  database: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      platformId: z.string(),
      postsUrl: z.url(),
      accountUrl: z.url(),
      singleTab: z.string(),
      month: z.string(),
      export: z.string(),
      accountReady: z.string(),
      matchWindowDays: z.number(),
      historyRange: z.tuple([z.number(), z.number()]),
      aliases: z.record(z.string(), z.string()),
      accountAliases: z.record(z.string(), z.string()),
    })
    .parse(parse(await readFile('config/channels.yaml', 'utf8')));
  const workspace = await loadConfig(),
    now = new Date(),
    today = shanghaiDate(now);
  const folder = `data/captures/${cfg.platformId}/${today}/${randomUUID()}`;
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await session.navigate(cfg.postsUrl, cfg.singleTab);
  await session.inspect(cfg.platformId);
  await session.click(cfg.singleTab);
  await session.click(cfg.month);
  const observation = await session.inspect(cfg.platformId);
  const count = observation.text.match(/共(\d+)条视频/);
  const postFile = folder + '/posts.csv';
  await session.download(cfg.export, postFile);
  paths.push(postFile);
  const rows = parseCsv(await readFile(postFile, 'utf8'));
  if (!count || Number(count[1]) !== rows.length) throw new Error('视频号导出条数与页面不一致');
  const eligible = rows
    .map((row) => ({ row, publishedAt: exportDate(row['发布时间']) }))
    .filter(
      (p) =>
        sinceStartDate(p.publishedAt, workspace.parameters.startDate, now) &&
        withinRecentWindow(p.publishedAt, now, workspace.parameters.recentWindow),
    );
  const incoming = eligible.map(({ row, publishedAt }) => {
    if (!row['视频ID'] || !row['视频描述']) throw new Error('视频号作品身份缺失');
    return {
      title: row['视频描述'],
      platformPostId: row['视频ID'],
      publishedAt,
      form: '视频' as const,
      key: postKey(cfg.platformId, row['视频描述'], publishedAt, row['视频ID']),
    };
  });
  const readings: CapturedReading[] = eligible.map(({ row, publishedAt }, index) => ({
    kind: 'list',
    sourcePath: postFile,
    capturedAt: now.toISOString(),
    postKey: incoming[index].key,
    reading: {
      status: 'ok',
      reason: null,
      posts: [
        {
          title: row['视频描述'],
          publishedAt,
          form: '视频',
          metrics: Object.entries(row)
            .filter(([label]) => !['视频描述', '视频ID', '发布时间'].includes(label))
            .map(([label, raw]) => ({ label, raw: raw || null })),
        },
      ],
      account: { dataDate: null, metrics: [] },
      records: [],
      signals: [],
    },
  }));
  await session.navigate(cfg.accountUrl, cfg.accountReady);
  await session.inspect(cfg.platformId);
  const accountFile = folder + '/account.csv';
  await session.download(cfg.export, accountFile);
  paths.push(accountFile);
  const daily = channelAccountRows(await readFile(accountFile, 'utf8'));
  if (!daily.length) throw new Error('视频号账号日数据为空');
  for (const row of daily) {
    const dataDate = exportDate(row['时间']);
    if (dataDate >= today) throw new Error('视频号账号数据日期尚未结束');
    if (dataDate < workspace.parameters.startDate) continue;
    readings.push({
      kind: 'account',
      sourcePath: accountFile,
      capturedAt: new Date().toISOString(),
      reading: {
        status: 'ok',
        reason: null,
        posts: [],
        account: {
          dataDate,
          metrics: Object.entries(row)
            .filter(([label]) => label !== '时间')
            .map(([label, raw]) => ({ label, raw: raw || null })),
        },
        records: [],
        signals: [],
      },
    });
  }
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
  if (monthly.length) writeState(database, `${cfg.platformId}:audience-month`, { month: today.slice(0, 7) });
  return { posts: incoming.length, accountDays: daily.length };
}
