import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
export async function loadDouyinConfig() {
  return z
    .object({
      platformId: z.string(),
      listUrl: z.url(),
      accountUrl: z.url(),
      listReady: z.string(),
      listScroll: z.string(),
      cardSelector: z.string(),
      titleSelector: z.string(),
      accountMonthSelector: z.string(),
      accountYesterdaySelector: z.string(),
      accountCalendarSelector: z.string(),
      previousMonthSelector: z.string(),
      calendarMonthLimit: z.number().int().positive(),
      detailTabs: z.array(z.string()),
      expandSources: z.string(),
      maxScreens: z.number().int().positive(),
      historyRange: z.tuple([z.number(), z.number()]),
      detailCheckpoints: z.array(z.number()),
      matchWindowDays: z.number(),
      sourceGroups: z.record(z.string(), z.array(z.string()).min(1)),
      aliases: z.record(z.string(), z.string()),
      accountAliases: z.record(z.string(), z.string()),
    })
    .parse(parse(await readFile('config/douyin.yaml', 'utf8')));
}
export type DouyinConfig = Awaited<ReturnType<typeof loadDouyinConfig>>;
