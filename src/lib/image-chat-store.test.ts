import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { initializeDatabase } from '../db/database';
import { contents, imageChatTurns, imageGenerations } from '../db/schema';
import { runImageChat } from './image-chat-store';
import { loadGenerationConfig } from '../ai/image-generation';
import { shanghaiDate } from '../browser/policy';
test('verbatim user input, resumed work thread, streamed answer, raw failure and daily accounting remain traceable', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'u9-chat-fixture-')),
    db = await initializeDatabase(path.join(folder, 'db'));
  try {
    db.db
      .insert(contents)
      .values({ id: 'fixture', fixture: true, title: 'fixture', form: '图文', updatedAt: 'fixture', videoCovers: {} })
      .run();
    const input = {
      id: randomUUID(),
      contentId: 'fixture',
      text: '  原样文字\n不要改写  ',
      referenceIds: [],
      purposeId: 'free',
    };
    const updates: string[] = [];
    await runImageChat(
      db,
      input,
      (t) => updates.push(t),
      async (call) => {
        expect(call.text).toBe(input.text);
        expect(call.threadId).toBeNull();
        call.onThread('fixture-thread');
        call.onText('原样');
        call.onText('原样回答');
        return { threadId: 'fixture-thread', files: [], text: '原样回答' };
      },
    );
    expect(updates).toEqual(['原样', '原样回答']);
    await runImageChat(
      db,
      input,
      () => {},
      async () => {
        throw Error('duplicate must not invoke');
      },
    );
    expect(db.db.select().from(imageGenerations).all()).toHaveLength(1);
    await expect(
      runImageChat(
        db,
        { ...input, id: randomUUID() },
        () => {},
        async (call) => {
          expect(call.threadId).toBe('fixture-thread');
          throw Error('EXACT SDK ERROR 123');
        },
      ),
    ).rejects.toThrow('EXACT SDK ERROR 123');
    expect(db.db.select().from(imageChatTurns).all()[1].error).toBe('EXACT SDK ERROR 123');
    expect(
      db.db
        .select()
        .from(imageGenerations)
        .all()
        .every((r) => r.calls === 1 && r.durationMs !== null),
    ).toBe(true);
    const config = await loadGenerationConfig();
    db.db
      .insert(imageGenerations)
      .values({
        id: randomUUID(),
        fixture: true,
        kind: 'chat',
        usageDate: shanghaiDate(),
        status: 'success',
        calls: config.dailyLimit,
        startedAt: 'fixture',
      })
      .run();
    await expect(
      runImageChat(
        db,
        { ...input, id: randomUUID() },
        () => {},
        async () => {
          throw Error('must not call');
        },
      ),
    ).rejects.toThrow('每日上限');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
