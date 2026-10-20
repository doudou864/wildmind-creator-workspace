import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database';
import { recordArchives, contents, layouts, imageDrafts, assets, topics, posts } from '../db/schema';
export const archiveKind = z.enum(['content', 'layout', 'image_draft', 'asset', 'topic']);
export type ArchiveKind = z.infer<typeof archiveKind>;
export const archiveInput = z.object({ kind: archiveKind, id: z.string().min(1), archived: z.boolean() }).strict();
const tables = { content: contents, layout: layouts, image_draft: imageDrafts, asset: assets, topic: topics };
export function archiveRecord(db: WorkspaceDatabase, raw: unknown) {
  const input = archiveInput.parse(raw),
    table = tables[input.kind];
  if (!db.db.select({ id: table.id }).from(table).where(eq(table.id, input.id)).get()) throw Error('记录不存在');
  const now = new Date().toISOString(),
    record = {
      key: `${input.kind}:${input.id}`,
      kind: input.kind,
      recordId: input.id,
      archivedAt: input.archived ? now : null,
      updatedAt: now,
    };
  db.db.insert(recordArchives).values(record).onConflictDoUpdate({ target: recordArchives.key, set: record }).run();
  return record;
}
export function archiveList(db: WorkspaceDatabase) {
  return db.db
    .select()
    .from(recordArchives)
    .all()
    .filter((a) => a.archivedAt)
    .map((a) => {
      const table = tables[a.kind],
        row = db.db.select().from(table).where(eq(table.id, a.recordId)).get();
      const title =
        row &&
        ('title' in row
          ? row.title
          : 'source' in row
            ? row.source.split('\n')[0]
            : 'input' in row
              ? row.input.title
              : '记录');
      return { ...a, title: title || '未命名记录', fixture: row && 'fixture' in row ? row.fixture : false };
    });
}
// Adds presentation metadata only. No statistical readers, posts, snapshots or frozen states are changed.
export function withArchives<T>(db: WorkspaceDatabase, data: T): T {
  const entries = db.db.select().from(recordArchives).all(),
    marks = new Map(entries.filter((x) => x.archivedAt).map((x) => [x.key, x.archivedAt]));
  const postContents = new Map(
    db.db
      .select({ id: posts.id, contentId: posts.contentId })
      .from(posts)
      .all()
      .map((p) => [p.id, p.contentId]),
  );
  const types: Record<string, ArchiveKind> = {
    contents: 'content',
    plannedContents: 'content',
    documents: 'layout',
    drafts: 'image_draft',
    assets: 'asset',
    topics: 'topic',
  };
  function walk(value: unknown, key = ''): unknown {
    if (Array.isArray(value)) {
      const kind = types[key];
      return value.map((row) => {
        if (!row || typeof row !== 'object') return row;
        const r = row as Record<string, unknown>;
        const marker = kind ? `${kind}:${r.id}` : key === 'works' ? `content:${postContents.get(String(r.id))}` : null;
        return marker ? { ...r, archivedAt: marks.get(marker) ?? null } : row;
      });
    }
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return value;
  }
  return walk(data) as T;
}
