import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { loadConfig } from '../lib/config.ts';
import { randomBetween, shanghaiDate } from '../browser/policy.ts';
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export async function loadSchedule() {
  const schedule = z
    .object({
      schedule: z.object({
        timezone: z.literal('Asia/Shanghai'),
        platforms: z.array(z.string()),
        launchdLabel: z.string(),
      }),
    })
    .parse(parse(await readFile('config/collection.yaml', 'utf8'))).schedule;
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
