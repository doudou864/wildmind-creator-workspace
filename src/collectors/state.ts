import { eq } from 'drizzle-orm';
import { collectionState } from '../db/schema.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
export function readState(database: WorkspaceDatabase, key: string) {
  return database.db.select().from(collectionState).where(eq(collectionState.key, key)).get()?.value;
}
export function writeState(database: WorkspaceDatabase, key: string, value: Record<string, unknown>) {
  const updatedAt = new Date().toISOString();
  database.db
    .insert(collectionState)
    .values({ key, value, updatedAt })
    .onConflictDoUpdate({ target: collectionState.key, set: { value, updatedAt } })
    .run();
}
