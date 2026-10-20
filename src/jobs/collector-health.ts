import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { crawlLogs, collectionState } from '../db/schema.ts';
import { loadSchedule } from './schedule.ts';
import { loadConfig } from '../lib/config.ts';
export function collectorHealth(db: WorkspaceDatabase, platforms: { id: string; name: string }[], now = new Date()) {
  const logs = db.db
    .select()
    .from(crawlLogs)
    .all()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return platforms.flatMap((p) => {
    const rows = logs.filter((r) => r.platformId === p.id),
      latest = rows[0],
      success = rows.find((r) => r.status === 'success' && r.finishedAt);
    const warnings: { platformId: string; reason: string }[] = [];
    if (latest?.status === 'failed')
      warnings.push({ platformId: p.id, reason: `${p.name}采集失败：${latest.reason ?? '请查看采集日志'}` });
    if (!success) warnings.push({ platformId: p.id, reason: `${p.name}尚无成功采集记录` });
    else if (now.getTime() - Date.parse(success.finishedAt!) > 86400000)
      warnings.push({
        platformId: p.id,
        reason: `${p.name}超过 1 天未更新，最近成功：${success.finishedAt!.slice(0, 10)}`,
      });
    return warnings;
  });
}
export async function currentHealth(db: WorkspaceDatabase) {
  const [config, schedule] = await Promise.all([loadConfig(), loadSchedule()]);
  return collectorHealth(
    db,
    config.platforms.filter((p) => schedule.platforms.includes(p.id)),
  );
}
export async function notifyCollectorHealth(
  db: WorkspaceDatabase,
  notify: (message: string) => Promise<unknown> = (message: string) =>
    promisify(execFile)('/usr/bin/osascript', [
      '-e',
      'on run argv\ndisplay notification (item 1 of argv) with title "工作台：采集需要处理"\nend run',
      message,
    ]),
) {
  const warnings = await currentHealth(db),
    fingerprint = JSON.stringify(warnings),
    key = 'collector-health-notification',
    old = db.db.select().from(collectionState).where(eq(collectionState.key, key)).get();
  if (old?.value.fingerprint === fingerprint) return false;
  if (warnings.length) await notify(warnings.map((w) => w.reason).join('；'));
  db.db
    .insert(collectionState)
    .values({ key, value: { fingerprint }, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: collectionState.key,
      set: { value: { fingerprint }, updatedAt: new Date().toISOString() },
    })
    .run();
  return warnings.length > 0;
}
