import type { WorkspaceDatabase } from './database.ts';
// Approved U6 artefacts, identified by IDs and explicit content references; never by title.
export const u8Fixtures = [
  { table: 'contents', id: 'c051b651-924b-4aac-ac52-2886857e5b81' },
  { table: 'topics', id: '3c1b569f-68ce-499b-a56e-ea8f53264a1a' },
  { table: 'assets', id: 'a4b3e572-4c30-4a4f-af2c-41a77c57da7e' },
  { table: 'layouts', id: 'f27560c2-30bc-45eb-b4f7-03efc6291c4d' },
  { table: 'image_drafts', id: '47819964-c3ea-4c87-9ebd-2f45df1ea606' },
  { table: 'image_drafts', id: 'b636e2cb-82d1-4593-96f8-15211e3949a4' },
  { table: 'image_tasks', id: 'fed58975-898d-49a2-80b5-d1e837ee4cd2' },
  { table: 'image_tasks', id: '62e5d4c7-1e95-47ef-8b8a-5db22a2607e0' },
  { table: 'image_generations', id: 'c7f54457-49b2-45a5-8a71-6d96fb6685be' },
  { table: 'image_generations', id: '6e688b0f-d011-43d0-98d4-eb2bd3cffa04' },
] as const;
export function markU8Fixtures(database: WorkspaceDatabase) {
  return database.sqlite.transaction(() => {
    for (const { table, id } of u8Fixtures) {
      if (!database.sqlite.prepare(`SELECT id FROM ${table} WHERE id=?`).get(id))
        throw Error(`确认记录缺失：${table}/${id}`);
      database.sqlite.prepare(`UPDATE ${table} SET fixture=1 WHERE id=?`).run(id);
    }
    return u8Fixtures;
  })();
}
