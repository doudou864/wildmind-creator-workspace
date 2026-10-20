import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { contents, layouts, imageDrafts, assets, topics } from '../db/schema';
import { archiveRecord, withArchives, archiveList } from './record-archives';
import { createLayout } from './layout-model';
test('five record types archive reversibly in a separate presentation ledger; original content and frozen selection remain untouched', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'u9-archives-fixture-')),
    db = await initializeDatabase(path.join(folder, 'db'));
  try {
    const now = '2026-10-20T00:00:00Z';
    db.db
      .insert(contents)
      .values({ id: 'fixture-content', fixture: true, title: 'fixture', form: '图文', videoCovers: {}, updatedAt: now })
      .run();
    db.db
      .insert(layouts)
      .values({ ...createLayout('fixture\nfixture', 'fixture-content'), id: 'fixture-layout', fixture: true })
      .run();
    db.db
      .insert(imageDrafts)
      .values({
        id: 'fixture-image',
        fixture: true,
        input: {
          uploadPurposeId: '',
          title: 'fixture',
          purposeId: 'free',
          styleId: 'none',
          prompt: 'fixture',
          content: '',
          ratio: '1:1',
          contentId: 'fixture-content',
          topicId: null,
          existingAssets: {},
          parentAssetId: null,
          editInstruction: '',
        },
        updatedAt: now,
      })
      .run();
    db.db
      .insert(assets)
      .values({
        id: 'fixture-asset',
        fixture: true,
        familyId: 'fixture-family',
        title: 'fixture',
        purposeId: 'free',
        ratio: '1:1',
        width: 1,
        height: 1,
        mime: 'image/png',
        path: 'fixture',
        contentId: 'fixture-content',
        source: 'upload',
        prompt: 'fixture',
        version: 1,
        selected: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    db.db
      .insert(topics)
      .values({
        id: 'fixture-topic',
        fixture: true,
        title: 'fixture',
        direction: 'fixture',
        channelId: 'fixture',
        signal: 'fixture',
        sourceContext: 'fixture',
        exploration: false,
        status: 'selected',
        frozenFire: true,
        selectedAt: now,
        automatic: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const read = () => ({
      contents: db.db.select().from(contents).all(),
      documents: db.db.select().from(layouts).all(),
      drafts: db.db.select().from(imageDrafts).all(),
      assets: db.db.select().from(assets).all(),
      topics: db.db.select().from(topics).all(),
    });
    const before = read();
    const rows = [
      ['content', 'fixture-content'],
      ['layout', 'fixture-layout'],
      ['image_draft', 'fixture-image'],
      ['asset', 'fixture-asset'],
      ['topic', 'fixture-topic'],
    ] as const;
    for (const [kind, id] of rows) archiveRecord(db, { kind, id, archived: true });
    expect(archiveList(db)).toHaveLength(5);
    expect(read()).toEqual(before);
    for (const items of Object.values(withArchives(db, read())))
      expect((items[0] as { archivedAt?: string }).archivedAt).toBeTruthy();
    for (const [kind, id] of rows) archiveRecord(db, { kind, id, archived: false });
    expect(archiveList(db)).toHaveLength(0);
    expect(read()).toEqual(before);
    for (const items of Object.values(withArchives(db, read())))
      expect((items[0] as { archivedAt?: string }).archivedAt).toBeNull();
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
