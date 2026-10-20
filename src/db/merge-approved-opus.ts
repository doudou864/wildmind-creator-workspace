import type { WorkspaceDatabase } from './database.ts';

export const opusMerge = {
  source: 'efb564b8-8403-48fe-b12c-7d127953f48a',
  target: '32368148-3fd2-437f-b2c2-33f00d254356',
} as const;

// One approved repair, not a fuzzy matcher. Any unexpected dependent data aborts the transaction.
export function mergeApprovedOpus(database: WorkspaceDatabase) {
  const db = database.sqlite;
  return db.transaction(() => {
    const source = db.prepare('SELECT * FROM contents WHERE id=?').get(opusMerge.source) as
      { merged_into: string | null; form: string } | undefined;
    const target = db.prepare('SELECT * FROM contents WHERE id=?').get(opusMerge.target) as
      { merged_into: string | null; form: string } | undefined;
    if (!source || !target || target.merged_into || source.form !== target.form)
      throw Error('合并身份或内容形式不匹配，取消执行');
    if (source.merged_into === opusMerge.target) return { alreadyMerged: true, movedPosts: 0 };
    if (source.merged_into) throw Error('旧档已指向其他作品');
    for (const table of ['assets', 'layouts', 'messages', 'publish_records', 'publish_snapshots', 'publish_videos']) {
      if (db.prepare(`SELECT id FROM ${table} WHERE content_id=? LIMIT 1`).get(opusMerge.source))
        throw Error(`${table} 出现调查之外的引用，取消执行并重新审查`);
    }
    for (const table of ['image_drafts', 'image_tasks']) {
      if (db.prepare(`SELECT id FROM ${table} WHERE json_extract(input,'$.contentId')=? LIMIT 1`).get(opusMerge.source))
        throw Error(`${table} 出现嵌套引用，取消执行并重新审查`);
    }
    const rows = db.prepare('SELECT platform_id FROM posts WHERE content_id=?').all(opusMerge.source) as {
      platform_id: string;
    }[];
    if (rows.length !== 1 || rows[0].platform_id !== 'channels') throw Error('旧档平台记录与批准清单不一致');
    if (db.prepare("SELECT id FROM posts WHERE content_id=? AND platform_id='channels'").get(opusMerge.target))
      throw Error('主档已存在视频号记录，禁止重复合并');
    const result = db
      .prepare('UPDATE posts SET content_id=? WHERE content_id=?')
      .run(opusMerge.target, opusMerge.source);
    db.prepare('UPDATE contents SET merged_into=? WHERE id=?').run(opusMerge.target, opusMerge.source);
    return { alreadyMerged: false, movedPosts: result.changes };
  })();
}
