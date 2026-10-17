import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadBrowserPolicy } from '../src/browser/policy.ts';
import { loadSchedule } from '../src/jobs/schedule.ts';
const config = await loadSchedule();
const policy = await loadBrowserPolicy();
const root = process.cwd();
const escape = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
await mkdir('data/jobs', { recursive: true, mode: 0o700 });
await mkdir(path.join(os.homedir(), 'Library/LaunchAgents'), { recursive: true });
const file = path.join(os.homedir(), 'Library/LaunchAgents', `${config.launchdLabel}.plist`);
const plist = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${escape(config.launchdLabel)}</string><key>ProgramArguments</key><array><string>${escape(process.execPath)}</string><string>--experimental-strip-types</string><string>${escape(path.join(root, 'scripts/collect.mjs'))}</string><string>--scheduled</string></array><key>WorkingDirectory</key><string>${escape(root)}</string><key>StartInterval</key><integer>${policy.confirmationPollSeconds}</integer><key>RunAtLoad</key><true/><key>EnvironmentVariables</key><dict><key>PATH</key><string>${escape(process.env.PATH ?? '/usr/bin:/bin')}</string></dict><key>StandardOutPath</key><string>${escape(path.join(root, 'data/jobs/collector.log'))}</string><key>StandardErrorPath</key><string>${escape(path.join(root, 'data/jobs/collector-errors.log'))}</string></dict></plist>`;
await writeFile(file, plist);
execFileSync('/usr/bin/plutil', ['-lint', file], { stdio: 'inherit' });
try {
  execFileSync('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${config.launchdLabel}`], { stdio: 'ignore' });
} catch {}
execFileSync('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, file]);
console.log(`已安装：${file}`);
