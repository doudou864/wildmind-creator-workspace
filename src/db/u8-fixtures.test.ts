import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from './database';
import { u8Fixtures, markU8Fixtures } from './u8-fixtures';
import { isVisibleRecord } from '../ui/visible-records';
import { refreshReviews } from '../lib/review-store';
import { loadConfig } from '../lib/config';
import { loadDataCenterConfig } from '../lib/data-center-config';
import { dataCenterData } from '../lib/data-center-store';

test('approved rehearsal records remain traceable without changing first-selection evidence or counting as real work', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'u8-fixtures-'));
  const database = await initializeDatabase(path.join(dir, 'test.db'));
  try {
    for (const { table, id } of u8Fixtures) {
      const columns = database.sqlite.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
      }[];
      const row: Record<string, string | number> = { id };
      for (const col of columns.filter((c) => c.name !== 'id' && c.notnull && c.dflt_value === null))
        row[col.name] = col.type === 'INTEGER' ? 0 : '{}';
      database.sqlite
        .prepare(
          `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row)
            .map(() => '?')
            .join(',')})`,
        )
        .run(...Object.values(row));
    }
    const content = u8Fixtures.find((r) => r.table === 'contents')!.id;
    const topic = u8Fixtures.find((r) => r.table === 'topics')!.id;
    database.sqlite
      .prepare(
        "UPDATE topics SET status='selected', frozen_fire=1, selected_at='2026-10-01', frozen_evidence='{}' WHERE id=?",
      )
      .run(topic);
    database.sqlite.prepare("UPDATE contents SET topic_id=?, form='视频' WHERE id=?").run(topic, content);
    const read = () =>
      u8Fixtures.map(
        ({ table, id }) =>
          database.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) as Record<string, unknown>,
      );
    const before = read();
    markU8Fixtures(database);
    markU8Fixtures(database);
    const after = read();
    expect(after.map(({ fixture, ...r }) => r)).toEqual(before.map(({ fixture, ...r }) => r));
    expect(after.every((r) => r.fixture === 1 && !isVisibleRecord({ ...r, fixture: true }))).toBe(true);
    expect(isVisibleRecord({ title: '真实测试作品', fixture: false })).toBe(true);
    // Even if a rehearsal later has a post, it must never become a baseline or hit-rate sample.
    database.sqlite
      .prepare('INSERT INTO posts (id,content_id,platform_id,published_at,title,updated_at) VALUES (?,?,?,?,?,?)')
      .run('fixture-post', content, 'douyin', '2026-10-01T00:00:00Z', 'fixture', 'original');
    const config = await loadConfig();
    expect(refreshReviews(database, config).posts).toEqual([]);
    expect(database.sqlite.prepare('SELECT * FROM review_checkpoints').all()).toEqual([]);
    const settings = await loadDataCenterConfig();
    expect(dataCenterData(database, config, settings).posts).toEqual([]);
    expect(read()).toEqual(after);
  } finally {
    database.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
