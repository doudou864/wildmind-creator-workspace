import { rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { loadSchedule } from '../src/jobs/schedule.ts';
const config = await loadSchedule(),
  file = path.join(os.homedir(), 'Library/LaunchAgents', `${config.launchdLabel}.plist`);
if (process.argv.includes('--dry-run'))
  console.log(`将卸载 ${config.launchdLabel} 并移除 ${file}；保留数据库、素材和日志。`);
else {
  try {
    execFileSync('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${config.launchdLabel}`], { stdio: 'ignore' });
  } catch {}
  await rm(file, { force: true });
  console.log('采集后台任务已卸载；数据库、素材和日志保留。');
}
