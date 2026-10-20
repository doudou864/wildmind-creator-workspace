import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { initializeDatabase } from '../db/database';
import { messages, messageActions } from '../db/schema';
import { handleMessage, readHandledMessages } from './message-actions';
import { inboxSummary } from '../ui/inbox-summary';
import { isMessageArchived } from './inbox-model';
test('manual handling is reversible and outranks stale platform evidence, new inbound messages reopen the same conversation without changing classification', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'u9-a-fixture-'));
  const db = await initializeDatabase(path.join(dir, 'test.db'));
  try {
    db.db
      .insert(messages)
      .values({
        id: 'fixture-message',
        fixture: true,
        platformId: 'douyin',
        channel: 'dm',
        author: '测试样本',
        body: 'fixture',
        sentAt: '2026-10-20T01:00:00Z',
        capturedAt: '2026-10-20T02:00:00Z',
        classification: { status: 'ready', result: { category: 'idea', reason: 'fixture' } },
        reply: {
          kind: 'dm',
          conversationId: 'fixture-conversation',
          latestConfirmed: true,
          lastSender: 'other',
          lastMessageAt: '2026-10-20T01:00:00Z',
        },
        context: [],
        contextComplete: true,
        dealSync: 'synced',
        updatedAt: 'original',
      })
      .run();
    const count = () => inboxSummary(readHandledMessages(db)).valuableWaiting;
    const raw = db.db.select().from(messages).all();
    expect(count()).toBe(1);
    const handled = handleMessage(
      db,
      'fixture-message',
      { action: 'replied', expectedRevision: 0, expectedActionId: null },
      '2026-10-20T03:00:00Z',
    );
    expect(count()).toBe(0);
    expect(isMessageArchived(handled)).toBe(true);
    expect(() =>
      handleMessage(db, 'fixture-message', { action: 'low_value', expectedRevision: 0, expectedActionId: null }),
    ).toThrow('新变化');
    const undone = handleMessage(
      db,
      'fixture-message',
      { action: 'undo', expectedRevision: 0, expectedActionId: handled.manualActionId! },
      '2026-10-20T03:01:00Z',
    );
    expect(count()).toBe(1);
    handleMessage(
      db,
      'fixture-message',
      { action: 'low_value', expectedRevision: 0, expectedActionId: undone.manualActionId! },
      '2026-10-20T03:02:00Z',
    );
    expect(count()).toBe(0);
    expect(db.db.select().from(messages).all()).toEqual(raw);
    db.db.update(messages).set({ capturedAt: '2026-10-20T04:00:00Z' }).where(eq(messages.id, 'fixture-message')).run();
    expect(count()).toBe(0);
    db.db
      .insert(messages)
      .values({
        ...raw[0],
        id: 'fixture-followup',
        body: '新的具体问题',
        sentAt: '2026-10-20T04:00:00Z',
        capturedAt: '2026-10-20T05:00:00Z',
        reply: {
          kind: 'dm',
          conversationId: 'fixture-conversation',
          latestConfirmed: true,
          lastSender: 'other',
          lastMessageAt: '2026-10-20T04:00:00Z',
        },
      })
      .run();
    expect(count()).toBe(1);
    expect(readHandledMessages(db).every((m) => m.newReply && !isMessageArchived(m))).toBe(true);
    expect(db.db.select().from(messageActions).all()).toHaveLength(3);
    expect(db.db.select().from(messages).all()[0].classification).toEqual(raw[0].classification);
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
