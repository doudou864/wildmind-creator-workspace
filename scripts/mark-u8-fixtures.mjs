import { mkdir, writeFile } from 'node:fs/promises';
import { initializeDatabase, backupDatabase } from '../src/db/database.ts';
import { markU8Fixtures, u8Fixtures } from '../src/db/u8-fixtures.ts';
const db = await initializeDatabase();
try {
  const backup = await backupDatabase(db, 'data/backups/u8-e');
  const read = () =>
    u8Fixtures.map(({ table, id }) => ({ table, row: db.sqlite.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id) }));
  const before = read();
  markU8Fixtures(db);
  const after = read();
  const withoutFlag = (rows) => rows.map(({ table, row: { fixture, ...row } }) => ({ table, row }));
  if (JSON.stringify(withoutFlag(before)) !== JSON.stringify(withoutFlag(after))) throw Error('标记以外的字段发生变化');
  const proof = {
    backup,
    marked: u8Fixtures,
    preservedAllOtherFields: true,
    sourceTopic: after.find((r) => r.table === 'topics').row,
    layoutVariantsPreserved: JSON.parse(after.find((r) => r.table === 'layouts').row.variants),
    postCount: db.sqlite.prepare('SELECT count(*) AS n FROM posts WHERE content_id=?').get(u8Fixtures[0].id).n,
    foreignKeyErrors: db.sqlite.pragma('foreign_key_check'),
  };
  await mkdir('docs/verification/u8/e', { recursive: true });
  await writeFile('docs/verification/u8/e/fixture-proof.json', JSON.stringify(proof, null, 2) + '\n');
  console.log({ marked: after.length, onlyFixtureChanged: true, postCount: proof.postCount });
} finally {
  db.sqlite.close();
}
