import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { messageActions, messages, posts } from '../db/schema.ts';
import { replyUnit, type InboxMessage } from './inbox-model.ts';
export const messageActionSchema = z
  .object({
    action: z.enum(['replied', 'low_value', 'undo']),
    expectedActionId: z.string().nullable(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
type Action = typeof messageActions.$inferSelect;
function incoming(items: InboxMessage[]) {
  return items.flatMap((m) => [
    ...(m.reply.kind === 'comment' || m.reply.lastSender === 'other'
      ? [{ key: JSON.stringify([m.id, m.body, m.sentAt]), time: m.sentAt }]
      : []),
    ...m.context
      .filter((c) => c.sender === 'other')
      .map((c) => ({ key: JSON.stringify([c.id, c.body, c.sentAt]), time: c.sentAt })),
    ...(m.reply.kind === 'dm' && m.reply.latestConfirmed && m.reply.lastSender === 'other'
      ? [{ key: JSON.stringify(['latest', m.reply.lastMessageAt]), time: m.reply.lastMessageAt }]
      : []),
  ]);
}
export function applyMessageActions(items: InboxMessage[], actions: Action[]): InboxMessage[] {
  const latest = new Map<string, Action>();
  for (const action of actions) latest.set(action.unit, action);
  return items.map((m) => {
    const action = latest.get(replyUnit(m));
    if (!action || action.action === 'undo')
      return { ...m, manualDisposition: null, manualActionId: action?.id ?? null, newReply: false };
    const rows = items.filter((row) => replyUnit(row) === action.unit);
    const latestRow = [...rows].sort(
      (a, b) => (Date.parse(b.capturedAt ?? '') || 0) - (Date.parse(a.capturedAt ?? '') || 0),
    )[0];
    const answered =
      latestRow.reply.kind === 'dm' && latestRow.reply.latestConfirmed && latestRow.reply.lastSender === 'self';
    const reopened =
      !answered &&
      incoming(rows).some(
        (point) =>
          !action.baseline.includes(point.key) && point.time && Date.parse(point.time) > Date.parse(action.createdAt),
      );
    return { ...m, manualDisposition: reopened ? null : action.action, manualActionId: action.id, newReply: reopened };
  });
}
export function readHandledMessages(db: WorkspaceDatabase) {
  const storedPosts = db.db.select().from(posts).all();
  return applyMessageActions(
    db.db
      .select()
      .from(messages)
      .all()
      .map((m) => ({ ...m, platformPostId: storedPosts.find((p) => p.id === m.postId)?.platformPostId ?? null })),
    db.db
      .select()
      .from(messageActions)
      .orderBy(sql`rowid`)
      .all(),
  );
}
export function handleMessage(
  db: WorkspaceDatabase,
  id: string,
  input: z.infer<typeof messageActionSchema>,
  now = new Date().toISOString(),
) {
  return db.sqlite.transaction(() => {
    const items = readHandledMessages(db),
      m = items.find((m) => m.id === id);
    if (!m) throw Error('消息不存在');
    if (m.revision !== input.expectedRevision || (m.manualActionId ?? null) !== input.expectedActionId)
      throw Error('消息已有新变化，请刷新后再处理');
    const unit = replyUnit(m);
    db.db
      .insert(messageActions)
      .values({
        id: randomUUID(),
        unit,
        messageId: id,
        action: input.action,
        baseline: incoming(items.filter((row) => replyUnit(row) === unit)).map((p) => p.key),
        createdAt: now,
      })
      .run();
    return readHandledMessages(db).find((m) => m.id === id)!;
  })();
}
