import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from './database';
import { mergeApprovedOpus, opusMerge } from './merge-approved-opus';
import { visibleRecords } from '../ui/visible-records';
import { contents } from './schema';
test('approved merge preserves platform identity, readings and old archive; rerun is harmless', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'u8-merge-'));
  const d = await initializeDatabase(path.join(dir, 'test.db'));
  try {
    for (const id of [opusMerge.source, opusMerge.target])
      d.sqlite
        .prepare(
          "INSERT INTO contents(id,form,title,video_covers,updated_at) VALUES (?,'视频','测试档案','{}','original')",
        )
        .run(id);
    d.sqlite
      .prepare(
        "INSERT INTO posts(id,content_id,platform_id,platform_post_id,published_at,title,updated_at) VALUES ('post',?,'channels','platform-original','2026-10-13','测试','original')",
      )
      .run(opusMerge.source);
    d.sqlite
      .prepare(
        "INSERT INTO post_snapshots(id,post_id,captured_at,capture_date,metric_id,value,backfill_kind,updated_at) VALUES ('sample','post','time','date','metric',16,'none','original')",
      )
      .run();
    const before = d.sqlite.prepare('SELECT * FROM post_snapshots').all();
    expect(mergeApprovedOpus(d).movedPosts).toBe(1);
    expect(mergeApprovedOpus(d).alreadyMerged).toBe(true);
    expect(d.sqlite.prepare('SELECT * FROM post_snapshots').all()).toEqual(before);
    expect(d.sqlite.prepare('SELECT content_id,platform_post_id,published_at FROM posts').get()).toEqual({
      content_id: opusMerge.target,
      platform_post_id: 'platform-original',
      published_at: '2026-10-13',
    });
    expect(d.db.select().from(contents).all()).toHaveLength(2);
    expect(visibleRecords({ contents: d.db.select().from(contents).all() }).contents.map((c) => c.id)).toEqual([
      opusMerge.target,
    ]);
  } finally {
    d.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
