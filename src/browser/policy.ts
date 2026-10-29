import { collectionSignal } from '../jobs/cancellation.ts';
import { setTimeout as delay } from 'node:timers/promises';
import { countPage } from '../jobs/telemetry.ts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
const range = z.tuple([z.number().int().positive(), z.number().int().positive()]).refine(([a, b]) => a <= b);
export async function loadBrowserPolicy(root = process.cwd()) {
  return z
    .object({
      browser: z.object({
        actionDelayMs: range,
        platformDelayMs: range,
        dwellMs: range,
        scrollPixels: range,
        dailyPageLimit: z.number().int().positive(),
        riskMarkers: z.array(z.string()).min(1),
        confirmationPollSeconds: z.number().positive(),
        screenshotRetryCount: z.number().int().min(0).max(2),
      }),
    })
    .parse(parse(await readFile(path.join(root, 'config/collection.yaml'), 'utf8'))).browser;
}
export function randomBetween(range: [number, number], random = Math.random) {
  return Math.floor(range[0] + random() * (range[1] - range[0] + 1));
}
export function pause(ms: number) {
  return delay(ms, undefined, { signal: collectionSignal() });
}
export function shanghaiDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
export function confirmationDeadline(time: string, now = new Date()) {
  return new Date(`${shanghaiDate(now)}T${time}:00+08:00`).toISOString();
}

// A short filesystem lock shares the daily budget across login and collection processes.
export async function consumePage(root = process.cwd(), now = new Date()) {
  const { mkdir, writeFile, rename, rm } = await import('node:fs/promises');
  const directory = path.join(root, 'data/browser');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, 'usage.lock');
  // Parallel sessions share only this short budget update, never the whole browser task.
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || attempt >= 100) throw error;
      await pause(25);
    }
  }
  try {
    const filename = path.join(directory, 'usage.json');
    let record = { date: shanghaiDate(now), count: 0 };
    try {
      const saved = JSON.parse(await readFile(filename, 'utf8'));
      if (saved.date === record.date)
        record = z.object({ date: z.string(), count: z.number().int().nonnegative() }).parse(saved);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (record.count >= (await loadBrowserPolicy(root)).dailyPageLimit) throw new Error('已达到每天页面数上限');
    record.count++;
    countPage();
    await writeFile(filename + '.tmp', JSON.stringify(record), { mode: 0o600 });
    await rename(filename + '.tmp', filename);
  } finally {
    await rm(lock, { recursive: true });
  }
}
