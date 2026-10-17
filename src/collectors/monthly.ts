import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { CollectionSession } from '../browser/collection-session.ts';
import { shanghaiDate } from '../browser/policy.ts';
import type { Judgment } from '../ai/structured.ts';
import { readState } from './state.ts';
import type { CapturedReading } from './storage.ts';
import { screenshotReading } from './recognition.ts';
export async function captureMonthly(
  database: WorkspaceDatabase,
  platformId: string,
  session: CollectionSession,
  judgment: Judgment,
  folder: string,
  paths: string[],
  now = new Date(),
): Promise<CapturedReading[]> {
  if (readState(database, `${platformId}:audience-month`)?.month === shanghaiDate(now).slice(0, 7)) return [];
  const all = z
    .record(
      z.string(),
      z.object({
        url: z.url(),
        ready: z.string(),
        click: z.string().optional(),
        scroll: z.string(),
        maxScreens: z.number().int().positive(),
        prompt: z.string(),
      }),
    )
    .parse(parse(await readFile('config/monthly.yaml', 'utf8')));
  const cfg = all[platformId];
  if (!cfg) return [];
  await mkdir(folder, { recursive: true, mode: 0o700 });
  await session.navigate(cfg.url, cfg.ready);
  if (cfg.click) await session.click(cfg.click);
  const readings: CapturedReading[] = [];
  for (let i = 0; i < cfg.maxScreens; i++) {
    const state = await session.inspect(platformId, cfg.scroll);
    const file = `${folder}/monthly-${i}.png`;
    await session.capture(file);
    paths.push(file);
    const reading = await judgment.read(
      screenshotReading,
      `只提取账号粉丝或观众的性别、年龄、地域分布原文，保存为audience记录；样本不足也如实记录，不能猜数。不能读取设备、兴趣。当前屏没有目标内容时status为ok、records为空，后续还会滚动；图像不可读才失败。posts/signals为空，account指标为空。${cfg.prompt}`,
      [file],
    );
    if (reading.status !== 'ok') throw new Error(reading.reason ?? '月度截图识别失败');
    reading.posts = [];
    reading.account = { dataDate: shanghaiDate(now), metrics: [] };
    reading.signals = [];
    reading.records = reading.records.filter((r) => r.type === 'audience' || r.type === 'viewing_times');
    const capture: CapturedReading = {
      kind: 'account',
      sourcePath: file,
      capturedAt: new Date().toISOString(),
      reading,
    };
    readings.push(capture);
    const json = file.replace('.png', '.json');
    await writeFile(json, JSON.stringify(capture));
    paths.push(json);
    if (state.scroll.top + state.scroll.height >= state.scroll.total - 3) break;
    if (i === cfg.maxScreens - 1) throw new Error('月度页面未读取完整');
    await session.scroll(cfg.scroll);
  }
  if (!readings.some((r) => r.reading.records.length)) throw new Error('月度画像无可读结果，不能标成已完成');
  return readings;
}
