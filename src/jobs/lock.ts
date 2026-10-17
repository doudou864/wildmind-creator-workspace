import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
export async function acquireJobLock(filename: string) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await writeFile(filename, String(process.pid), { flag: 'wx', mode: 0o600 });
      return async () => {
        await rm(filename, { force: true });
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const pid = Number(await readFile(filename, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) throw new Error('采集锁损坏，请检查 data/jobs 下锁文件');
    try {
      process.kill(pid, 0);
      return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    await rm(filename, { force: true });
  }
  throw new Error('采集锁竞争，请稍后重试');
}
