import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from './database.ts';
import { contents, imageDrafts, publishRecords } from './schema.ts';

// Explicit user confirmation on 2026-10-20. Never infer this list from names or links.
export const confirmedFixtures = [
  { table: 'contents', id: '017cfc52-c228-4df9-809e-6f92744f7428' },
  { table: 'contents', id: '23c65909-52c5-481f-876e-f9e7bd39dbbe' },
  { table: 'image_drafts', id: '7269cbfa-c50d-4cf6-b139-537001b93c63' },
  { table: 'publish_records', id: '92070da1-57ea-4c0b-8a10-54748a7f5fc3' },
  { table: 'publish_records', id: '9d5ab14c-a613-4af2-a4b4-20a025a6d488' },
  { table: 'publish_records', id: '0c46b7bd-ef3d-42e0-846d-ef31daaed398' },
] as const;
const tables = { contents, image_drafts: imageDrafts, publish_records: publishRecords };
export function markConfirmedFixtures(database: WorkspaceDatabase) {
  return database.db.transaction((tx) => {
    for (const record of confirmedFixtures) {
      const table = tables[record.table];
      if (!tx.select({ id: table.id }).from(table).where(eq(table.id, record.id)).get())
        throw new Error(`确认记录不存在，取消全部标记：${record.table}/${record.id}`);
      tx.update(table).set({ fixture: true }).where(eq(table.id, record.id)).run();
    }
    return confirmedFixtures;
  });
}
