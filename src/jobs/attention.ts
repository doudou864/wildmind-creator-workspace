import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { and, eq, ne } from 'drizzle-orm';
import { attentionItems } from '../db/schema.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
export function pendingAttention(database: WorkspaceDatabase) {
  return database.db.select().from(attentionItems).where(eq(attentionItems.status, 'pending')).all();
}
export function requireAttention(
  database: WorkspaceDatabase,
  input: Pick<typeof attentionItems.$inferInsert, 'platformId' | 'kind' | 'reason' | 'deadline' | 'spaceId' | 'page'>,
  now = new Date().toISOString(),
) {
  const existing = pendingAttention(database).find((x) => x.platformId === input.platformId && x.kind === input.kind);
  const item = { ...input, updatedAt: now };
  if (existing) {
    database.db.update(attentionItems).set(item).where(eq(attentionItems.id, existing.id)).run();
    return existing.id;
  }
  const id = randomUUID();
  database.db
    .insert(attentionItems)
    .values({ ...item, id, status: 'pending', createdAt: now })
    .run();
  return id;
}
export function resolveAttention(database: WorkspaceDatabase, platformId: string, now = new Date().toISOString()) {
  database.db
    .update(attentionItems)
    .set({ status: 'resolved', updatedAt: now })
    .where(
      and(
        eq(attentionItems.platformId, platformId),
        eq(attentionItems.status, 'pending'),
        ne(attentionItems.kind, 'capacity'),
      ),
    )
    .run();
}
export function expireConfirmations(database: WorkspaceDatabase, now = new Date().toISOString()) {
  const expired = pendingAttention(database).filter(
    (x) => x.kind === 'confirmation' && x.deadline && x.deadline <= now,
  );
  for (const item of expired)
    database.db
      .update(attentionItems)
      .set({ status: 'failed', reason: '未确认登录', updatedAt: now })
      .where(eq(attentionItems.id, item.id))
      .run();
  return expired;
}
export async function notifyAttention(database: WorkspaceDatabase) {
  const items = pendingAttention(database);
  if (!items.length) return;
  const message = items.map((x) => `${x.platformId}：${x.reason}`).join('；');
  // argv carries untrusted text, never interpolate it into AppleScript source.
  await promisify(execFile)('/usr/bin/osascript', [
    '-e',
    'on run argv\ndisplay notification (item 1 of argv) with title "工作台：需要你处理"\nend run',
    message,
  ]);
}
