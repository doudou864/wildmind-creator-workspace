import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { messages, messageActions } from '../db/schema';
import { writeReplyDraft } from './reply-draft';
import type { Judgment } from '../ai/structured';
test('drafting uses existing judgment and does not send, mark replied or rewrite the message', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'u9-reply-fixture-')),
    db = await initializeDatabase(path.join(folder, 'db'));
  try {
    db.db
      .insert(messages)
      .values({
        id: 'fixture-message',
        fixture: true,
        platformId: 'douyin',
        channel: 'comment',
        author: 'fixture',
        body: '如何整理素材？',
        sentAt: '2026-10-20T00:00:00Z',
        capturedAt: '2026-10-20T01:00:00Z',
        classification: { status: 'ready', result: { category: 'idea', reason: 'fixture' } },
        reply: { kind: 'comment', ownReplyFound: false, repliesComplete: true },
        context: [],
        contextComplete: true,
        dealSync: 'synced',
        updatedAt: 'fixture',
      })
      .run();
    const before = db.db.select().from(messages).all();
    const judgment: Judgment = {
      async read(schema, prompt) {
        expect(prompt).toContain('如何整理素材');
        return schema.parse({ draft: '可以先按作品归档，再给素材加用途标签。' });
      },
    };
    expect((await writeReplyDraft(db, 'fixture-message', judgment)).draft).toContain('作品归档');
    expect(db.db.select().from(messages).all()).toEqual(before);
    expect(db.db.select().from(messageActions).all()).toHaveLength(0);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
