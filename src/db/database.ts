import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdir, readdir, rm, chmod, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as schema from './schema.ts';

export function openDatabase(filename = path.join(process.cwd(), 'data/workspace.db')) {
  const sqlite = new Database(filename);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  return { sqlite, db: drizzle(sqlite, { schema }), filename };
}
export type WorkspaceDatabase = ReturnType<typeof openDatabase>;

// SQLite online backup includes committed WAL pages; copying only workspace.db does not.
export async function backupDatabase(
  database: WorkspaceDatabase,
  directory = path.join(path.dirname(database.filename), 'backups'),
) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = `workspace-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.hrtime.bigint().toString().padStart(20, '0')}-${randomUUID()}.db`;
  const destination = path.join(directory, name);
  const temporary = destination + '.tmp';
  try {
    await database.sqlite.backup(temporary);
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  const files = (await readdir(directory)).filter((file) => /^workspace-\d{4}-.*\.db$/.test(file)).sort();
  for (const oldest of files.slice(0, Math.max(0, files.length - 7)))
    await rm(path.join(directory, oldest), { force: true });
  return destination;
}
export async function initializeDatabase(
  filename = path.join(process.cwd(), 'data/workspace.db'),
  migrationsFolder = path.join(process.cwd(), 'src/db/migrations'),
) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const database = openDatabase(filename);
  try {
    // Also backs up an empty database on first install; failures prevent migration.
    await backupDatabase(database);
    migrate(database.db, { migrationsFolder });
    await chmod(filename, 0o600);
    return database;
  } catch (error) {
    database.sqlite.close();
    throw error;
  }
}
