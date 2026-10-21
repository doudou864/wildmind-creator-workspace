import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { acquireJobLock } from './lock.ts';
import { loadSchedule } from './schedule.ts';
const file = 'data/jobs/manual-collection.json';
export async function collectionRunning() {
  try {
    const pid = Number(await readFile('data/jobs/collect.pid', 'utf8'));
    if (pid > 0) {
      process.kill(pid, 0);
      return true;
    }
  } catch {}
  try {
    const job = JSON.parse(await readFile(file, 'utf8'));
    if (job.pid > 0) {
      process.kill(job.pid, 0);
      return true;
    }
  } catch {}
  return false;
}
export function collectionArgs(platform: string | undefined, allowed: string[]) {
  if (platform !== undefined && !allowed.includes(platform)) throw Error('该平台不在采集配置中');
  return ['--experimental-strip-types', 'scripts/collect.mjs', ...(platform ? ['--platform', platform] : [])];
}
export async function startCollection(platform?: string) {
  const args = collectionArgs(platform, (await loadSchedule()).platforms);
  await mkdir('data/jobs', { recursive: true });
  const release = await acquireJobLock('data/jobs/collection-launch.pid');
  if (!release) throw Error('正在启动采集，请稍后查看状态');
  try {
    if (await collectionRunning()) throw Error('已有采集任务在运行，请等待完成');
    const output = await open('data/jobs/manual-collection.log', 'a', 0o600);
    try {
      const child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', output.fd, output.fd],
      });
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve);
        child.once('error', reject);
      });
      await writeFile(
        file,
        JSON.stringify({ pid: child.pid, platform: platform ?? 'all', startedAt: new Date().toISOString() }),
      );
      child.unref();
    } finally {
      await output.close();
    }
    return { started: true };
  } finally {
    await release();
  }
}
