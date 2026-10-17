import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { CollectionSession } from '../../browser/collection-session.ts';
import type { Judgment } from '../../ai/structured.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { screenshotReading } from '../recognition.ts';
import type { CapturedReading } from '../storage.ts';
import { readState } from '../state.ts';
export async function captureAccountExtras(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  folder: string,
  paths: string[],
  now: Date,
) {
  const cfg = z
    .object({
      platformId: z.string(),
      accountExtras: z.object({
        url: z.url(),
        ready: z.string(),
        growthTab: z.string(),
        viewTab: z.string(),
        metrics: z.array(z.string()),
        scroll: z.string(),
        chart: z.string(),
        rightInset: z.number(),
        maxScreens: z.number(),
        viewport: z.object({ width: z.number(), height: z.number() }),
      }),
    })
    .parse(parse(await readFile('config/xiaohongshu.yaml', 'utf8')));
  const e = cfg.accountExtras,
    readings: CapturedReading[] = [],
    yesterday = shanghaiDate(new Date(now.getTime() - 86400000));
  session.viewport = e.viewport;
  await session.navigate(e.url, e.ready);
  await session.inspect(cfg.platformId);
  await session.click(e.growthTab);
  async function bottom() {
    for (let i = 0; i < e.maxScreens; i++) {
      const s = await session.inspect(cfg.platformId, e.scroll);
      if (s.scroll.top + s.scroll.height >= s.scroll.total - 3) return;
      await session.scroll(e.scroll);
    }
    throw new Error('账号辅助数据未滚动完成');
  }
  async function save(file: string, prompt: string) {
    paths.push(file);
    const reading = await judgment.read(screenshotReading, prompt, [file]);
    if (reading.status !== 'ok') throw new Error(reading.reason ?? '账号辅助数据识别失败');
    reading.posts = [];
    reading.signals = [];
    const capture: CapturedReading = {
      sourcePath: file,
      capturedAt: new Date().toISOString(),
      kind: 'account',
      reading,
    };
    readings.push(capture);
    const json = file.replace('.png', '.json');
    await writeFile(json, JSON.stringify(capture));
    paths.push(json);
    return reading;
  }
  for (const [i, label] of e.metrics.entries()) {
    await session.click(`text="${label}"`);
    await bottom();
    const file = `${folder}/profile-${i}.png`;
    await session.captureChartTip(e.chart, e.rightInset, file);
    const r = await save(
      file,
      `只取曲线悬停提示中的${label}，提示日期必须与${yesterday}月日一致，account.dataDate用该完整日期。不可读取上方近7日合计。若没有目标日提示则status=failed，不得用曲线未绘完推测缺数或用7日合计补填。只返回这一个账号指标，原数字单位保留。其他数组为空。`,
    );
    if (r.account.dataDate !== yesterday || r.account.metrics.length !== 1 || r.account.metrics[0].label !== label)
      throw new Error('主页单日指标或日期不符');
    r.records = [];
  }
  const monthly = readState(db, `${cfg.platformId}:watching-month`)?.month !== shanghaiDate(now).slice(0, 7);
  if (monthly) {
    await session.click(e.viewTab);
    await bottom();
    const file = `${folder}/watching-times.png`;
    await session.capture(file);
    const r = await save(
      file,
      '只记录观看时段图的原文及可确认的时段分布到viewing_times记录，保留统计周期；图上没有具体数值就不估算百分比或次数。可描述明显高低时段。不要观看来源或其他数字。account指标为空。',
    );
    r.account = { dataDate: yesterday, metrics: [] };
    r.records = r.records.filter((x) => x.type === 'viewing_times');
    if (!r.records.length) throw new Error('观看时段未读到');
  }
  for (const capture of readings) await writeFile(capture.sourcePath.replace('.png', '.json'), JSON.stringify(capture));
  session.viewport = undefined;
  return { readings, monthly };
}
