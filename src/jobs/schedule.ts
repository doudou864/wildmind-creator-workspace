import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { loadConfig } from '../lib/config.ts';
import { randomBetween, shanghaiDate } from '../browser/policy.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
import { readState, writeState } from '../collectors/state.ts';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export async function loadSchedule() {
  const schedule = z
    .object({
      schedule: z.object({
        timezone: z.literal('Asia/Shanghai'),
        platforms: z.array(z.string()),
        manualOnly: z.array(z.string()).default([]),
        launchdLabel: z.string(),
      }),
    })
    .parse(parse(await readFile('config/collection.yaml', 'utf8'))).schedule;
  if (schedule.manualOnly.some((id) => !schedule.platforms.includes(id))) throw Error('手动采集平台必须在平台列表内');
  const { parameters } = await loadConfig();
  const [start, end] = parameters.syncWindow.split('–').map((value) => time.parse(value));
  if (!start || !end) throw new Error('主抓取时间窗口无效');
  return { ...schedule, start, end, retries: z.array(time).parse(parameters.retryTimes) };
}
export function minuteOfDay(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
export function scheduleForDay(start: string, end: string, random = Math.random) {
  const min = minuteOfDay(start),
    max = minuteOfDay(end);
  if (max < min) throw new Error('随机启动时间范围无效');
  return randomBetween([min, max], random);
}
export function dailySchedule(database: WorkspaceDatabase, date: string, start: string, end: string) {
  return database.sqlite
    .transaction(() => {
      const key = `schedule:${date}`;
      const saved = readState(database, key);
      const previous = Number(saved?.chosen);
      const chosen =
        Number.isInteger(previous) && previous >= minuteOfDay(start) && previous <= minuteOfDay(end)
          ? previous
          : scheduleForDay(start, end);
      if (!saved || chosen !== previous) writeState(database, key, { ...saved, chosen });
      return chosen;
    })
    .immediate();
}
export function dueSlot(now: Date, chosen: number, retries: string[], attempted: string[], succeeded: boolean) {
  if (succeeded) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  const minute = minuteOfDay(parts);
  const slots = [{ id: 'main', time: chosen }, ...retries.map((t) => ({ id: t, time: minuteOfDay(t) }))];
  // A sleeping Mac may wake late; use the latest elapsed slot once, never burst all missed retries.
  const latest = [...slots].reverse().find((s) => s.time <= minute);
  return latest && !attempted.includes(latest.id) ? latest.id : null;
}
export { shanghaiDate };

// Preserve slots already attempted by the serial scheduler when upgrading mid-day.
export function platformSchedule(legacy: Record<string, unknown> | null | undefined, chosen: number, platform: string) {
  const successful = Array.isArray(legacy?.successfulPlatforms)
    ? legacy.successfulPlatforms.filter((id) => id === platform)
    : [];
  return {
    chosen,
    attempted: Array.isArray(legacy?.attempted) ? legacy.attempted : [],
    succeeded: !!legacy?.succeeded || successful.length > 0,
    successfulPlatforms: successful,
  };
}

// A manual login confirmation may finish its existing run; it cannot start a new scheduled run.
export function scheduledPlatforms(platforms: string[], manualOnly: string[], confirmations: string[]) {
  return platforms.filter((id) => !manualOnly.includes(id) || confirmations.includes(id));
}
