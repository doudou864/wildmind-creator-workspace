import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from './database';
import { contents, imageDrafts, publishRecords } from './schema';
import { confirmedFixtures, markConfirmedFixtures } from './confirmed-fixtures';
import { visibleRecords } from '../ui/visible-records';

const realIds = ['32368148-3fd2-437f-b2c2-33f00d254356', 'efb564b8-8403-48fe-b12c-7d127953f48a'];
const realMessages = [
  {
    id: 'fcec387aad91c450a9f9cac01c140f8120faf7de18d6bace9ab9c7ce8219722a',
    author: '张铎川',
    contentTitle: 'Opus5.5实战工作中最真实的一次测试',
  },
  {
    id: '1ccaa650fe4668b984d329c957f8ba4afcb94550a85ceedf83a08b4661e95799',
    author: '黄志才',
    contentTitle: 'Opus5.5实战工作中最真实的一次测试',
  },
];
test('only the six approved IDs are marked; raw records and four real records survive unchanged', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wildmind-confirmed-fixtures-'));
  const database = await initializeDatabase(path.join(dir, 'test.db'));
  try {
    const contentIds = [...confirmedFixtures.filter((r) => r.table === 'contents').map((r) => r.id), ...realIds];
    for (const id of contentIds)
      database.db
        .insert(contents)
        .values({
          id,
          title: 'Opus5.5实战工作中最真实的一次测试',
          form: '视频',
          videoCovers: {},
          updatedAt: 'original',
        })
        .run();
    for (const r of confirmedFixtures.filter((r) => r.table === 'image_drafts'))
      database.sqlite
        .prepare('INSERT INTO image_drafts (id,input,updated_at) VALUES (?, ?, ?)')
        .run(r.id, JSON.stringify({ title: '验收草稿' }), 'original');
    for (const r of confirmedFixtures.filter((r) => r.table === 'publish_records'))
      database.sqlite
        .prepare('INSERT INTO publish_records (id,content_id,state,draft,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(r.id, contentIds[0], 'draft', '{}', 'original', 'original');
    const read = () => ({
      contents: database.db.select().from(contents).all(),
      drafts: database.db.select().from(imageDrafts).all(),
      batches: database.db.select().from(publishRecords).all(),
      messages: realMessages,
    });
    const before = read();
    markConfirmedFixtures(database);
    markConfirmedFixtures(database);
    const raw = read();
    const view = visibleRecords(raw);
    expect(view.contents.map((r) => r.id)).toEqual(realIds);
    expect(view.drafts).toEqual([]);
    expect(view.batches).toEqual([]);
    expect(view.messages).toEqual(realMessages);
    expect(raw.contents.filter((r) => realIds.includes(r.id))).toEqual(
      before.contents.filter((r) => realIds.includes(r.id)),
    );
    for (const key of ['contents', 'drafts', 'batches'] as const) {
      expect(raw[key].map(({ fixture, ...row }) => row)).toEqual(before[key].map(({ fixture, ...row }) => row));
    }
    expect(
      [...raw.contents, ...raw.drafts, ...raw.batches]
        .filter((r) => r.fixture)
        .map((r) => r.id)
        .sort(),
    ).toEqual(confirmedFixtures.map((r) => r.id).sort());
  } finally {
    database.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
