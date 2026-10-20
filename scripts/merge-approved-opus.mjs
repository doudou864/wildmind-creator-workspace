import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initializeDatabase, backupDatabase } from '../src/db/database.ts';
import { mergeApprovedOpus, opusMerge } from '../src/db/merge-approved-opus.ts';
const db = await initializeDatabase();
try {
  const backup = await backupDatabase(db, 'data/backups/u8-a');
  const hash = (rows) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  const inspect = () => ({
    contents: db.sqlite
      .prepare('SELECT * FROM contents WHERE id IN (?,?) ORDER BY id')
      .all(opusMerge.source, opusMerge.target),
    platformPosts: db.sqlite
      .prepare('SELECT platform_id,count(*) AS count FROM posts GROUP BY platform_id ORDER BY platform_id')
      .all(),
    opusPosts: db.sqlite
      .prepare('SELECT * FROM posts WHERE content_id IN (?,?) ORDER BY id')
      .all(opusMerge.source, opusMerge.target),
    postsWithoutContentHash: hash(
      db.sqlite
        .prepare(
          'SELECT id,platform_id,platform_post_id,published_at,title,url,checkpoint_ratios,trend,hit,first_publication,removed,updated_at FROM posts ORDER BY id',
        )
        .all(),
    ),
    snapshotsHash: hash(db.sqlite.prepare('SELECT * FROM post_snapshots ORDER BY id').all()),
    checkpointsHash: hash(db.sqlite.prepare('SELECT * FROM review_checkpoints ORDER BY id').all()),
    topicsHash: hash(db.sqlite.prepare('SELECT * FROM topics ORDER BY id').all()),
    messagesHash: hash(db.sqlite.prepare('SELECT * FROM messages ORDER BY id').all()),
    messages: db.sqlite
      .prepare('SELECT count(*) AS total,count(content_id) AS linkedContent,count(post_id) AS linkedPost FROM messages')
      .get(),
    opusTopics: db.sqlite
      .prepare(
        'SELECT id,automatic,frozen_fire,status FROM topics WHERE id IN (SELECT topic_id FROM contents WHERE id IN (?,?)) ORDER BY id',
      )
      .all(opusMerge.source, opusMerge.target),
    foreignKeyErrors: db.sqlite.pragma('foreign_key_check'),
  });
  const before = inspect();
  const result = mergeApprovedOpus(db);
  const after = inspect();
  for (const key of ['postsWithoutContentHash', 'snapshotsHash', 'checkpointsHash', 'topicsHash', 'messagesHash'])
    if (before[key] !== after[key]) throw Error(`Unexpected change: ${key}`);
  await mkdir('docs/verification/u8/a', { recursive: true });
  const report = { backup, approved: opusMerge, result, before, after };
  await writeFile('docs/verification/u8/a/merge-proof.json', JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({ backup, result, before: before.messages, after: after.messages, unchanged: true }, null, 2),
  );
} finally {
  db.sqlite.close();
}
