import { readState } from '../collectors/state.ts';
import { dueSlot } from './schedule.ts';
import { openDatabase } from '../db/database.ts';
import { pendingAttention } from './attention.ts';
import { scheduledPlatforms } from './schedule.ts';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, open, rm } from 'node:fs/promises';
import { acquireJobLock } from './lock.ts';
import { shanghaiDate } from '../browser/policy.ts';
import { loadSchedule } from './schedule.ts';
export type CollectionMode = 'manual' | 'scheduled' | 'resume';
async function livePid(file: string, json = false) {
  try {
    const value = await readFile(file, 'utf8');
    const pid = Number(json ? JSON.parse(value).pid : value);
    if (pid > 0) {
      process.kill(pid, 0);
      return true;
    }
  } catch {}
  return false;
}
export async function legacyCollectionRunning() {
  return (await livePid('data/jobs/collect.pid')) || (await livePid('data/jobs/manual-collection.json', true));
}
export async function runningPlatforms() {
  const { platforms } = await loadSchedule();
  if (await legacyCollectionRunning()) return platforms;
  const running = await Promise.all(
    platforms.map(
      async (id) =>
        (await livePid(`data/jobs/collect-${id}.pid`)) || (await livePid(`data/jobs/collection-${id}.json`, true)),
    ),
  );
  return platforms.filter((_, index) => running[index]);
}
export function activeCollection(latest: { status: string; startedAt: string } | undefined, launchedAt?: string) {
  return (
    latest?.status === 'running' ||
    (!!launchedAt && Date.parse(launchedAt) > Date.parse(latest?.startedAt ?? '1970-01-01'))
  );
}
export async function collectionLaunchedAt(platform: string) {
  const { platforms } = await loadSchedule();
  if (!platforms.includes(platform)) throw Error('平台不在采集配置中');
  try {
    return JSON.parse(await readFile(`data/jobs/collection-${platform}.json`, 'utf8')).startedAt as string;
  } catch {
    return undefined;
  }
}
export async function collectionRunning() {
  return (await runningPlatforms()).length > 0;
}
export function collectionArgs(platform: string | undefined, allowed: string[], mode: CollectionMode = 'manual') {
  if (platform !== undefined && !allowed.includes(platform)) throw Error('该平台不在采集配置中');
  return [
    '--experimental-strip-types',
    'scripts/collect.mjs',
    ...(platform ? ['--platform', platform] : []),
    ...(mode === 'manual' ? [] : [`--${mode}`]),
  ];
}
export async function startCollection(platform?: string, mode: CollectionMode = 'manual') {
  const schedule = await loadSchedule();
  const { platforms, manualOnly } = schedule;
  collectionArgs(platform, platforms, mode);
  let targets = platform ? [platform] : platforms;
  if (mode === 'scheduled') {
    const db = openDatabase();
    try {
      const confirmations = pendingAttention(db)
        .filter((item) => item.kind === 'confirmation')
        .map((item) => item.platformId);
      targets = scheduledPlatforms(targets, manualOnly, confirmations).filter((id) => {
        if (confirmations.includes(id)) return true;
        const state = readState(db, `schedule:${shanghaiDate()}:${id}`);
        if (!state) return true;
        return !!dueSlot(
          new Date(),
          Number(state.chosen),
          schedule.retries,
          Array.isArray(state.attempted) ? (state.attempted as string[]) : [],
          !!state.succeeded,
        );
      });
    } finally {
      db.sqlite.close();
    }
  }
  if (await legacyCollectionRunning())
    throw Error('上一版采集任务仍在运行，完成后即可按平台并行采集；选题取材可独立运行');
  await mkdir('data/jobs', { recursive: true });
  const results = await Promise.all(
    targets.map(async (id) => {
      const release = await acquireJobLock(`data/jobs/collection-launch-${id}.pid`);
      if (!release) return { id, started: false };
      try {
        if (mode === 'scheduled') {
          try {
            if (JSON.parse(await readFile(`data/jobs/stop-${id}.json`, 'utf8')).date === shanghaiDate())
              return { id, started: false };
          } catch {}
        }
        if ((await livePid(`data/jobs/collect-${id}.pid`)) || (await livePid(`data/jobs/collection-${id}.json`, true)))
          return { id, started: false };
        await rm(`data/jobs/stop-${id}.json`, { force: true });
        const output = await open(`data/jobs/collection-${id}.log`, 'a', 0o600);
        try {
          const child = spawn(process.execPath, collectionArgs(id, platforms, mode), {
            cwd: process.cwd(),
            detached: true,
            stdio: ['ignore', output.fd, output.fd],
          });
          await new Promise<void>((resolve, reject) => {
            child.once('spawn', resolve);
            child.once('error', reject);
          });
          await writeFile(
            `data/jobs/collection-${id}.json`,
            JSON.stringify({ pid: child.pid, platform: id, startedAt: new Date().toISOString() }),
          );
          child.unref();
        } finally {
          await output.close();
        }
        return { id, started: true };
      } catch (e) {
        return { id, started: false, error: e instanceof Error ? e.message : '启动失败' };
      } finally {
        await release();
      }
    }),
  );
  const startedPlatforms = results.filter((r) => r.started).map((r) => r.id);
  const skippedPlatforms = results.filter((r) => !r.started && !r.error).map((r) => r.id);
  const errors = results.filter((r) => r.error).map((r) => ({ platform: r.id, reason: r.error! }));
  if (platform && !startedPlatforms.length) throw Error(errors[0]?.reason ?? '这个平台已在采集，其他平台仍可启动');
  return { started: startedPlatforms.length > 0, startedPlatforms, skippedPlatforms, errors };
}

export async function stopCollection(platform?: string) {
  const { platforms } = await loadSchedule();
  collectionArgs(platform, platforms);
  const requestedAt = new Date().toISOString();
  await mkdir('data/jobs', { recursive: true });
  const legacy = await legacyCollectionRunning();
  const targets = legacy ? platforms : platform ? [platform] : platforms;
  for (const id of targets) {
    const release = await acquireJobLock(`data/jobs/collection-launch-${id}.pid`);
    if (!release) throw Error('平台刚在启动，请稍后再点停止');
    try {
      await writeFile(`data/jobs/stop-${id}.json`, JSON.stringify({ requestedAt, date: shanghaiDate() }));
    } finally {
      await release();
    }
  }
  if (legacy) {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const pid = (await livePid('data/jobs/collect.pid'))
      ? Number(await readFile('data/jobs/collect.pid', 'utf8'))
      : Number(JSON.parse(await readFile('data/jobs/manual-collection.json', 'utf8')).pid);
    const command = (await promisify(execFile)('/bin/ps', ['-p', String(pid), '-o', 'command='])).stdout;
    if (!command.includes('scripts/collect.mjs')) throw Error('旧任务身份无法确认，未终止其他进程');
    const group = Number((await promisify(execFile)('/bin/ps', ['-p', String(pid), '-o', 'pgid='])).stdout.trim());
    process.kill(group === pid ? -pid : pid, 'SIGTERM');
  }
  return { stopping: targets, legacy };
}
