import { existsSync } from 'node:fs';
import { initializeDatabase } from '../src/db/database.ts';
import { markConfirmedFixtures } from '../src/db/confirmed-fixtures.ts';
if (!existsSync('data/workspace.db')) throw new Error('本机数据库不存在，停止执行。');
// initializeDatabase completes an online backup before running additive Drizzle migrations.
const database = await initializeDatabase();
try {
  console.log(JSON.stringify({ marked: markConfirmedFixtures(database) }, null, 2));
} finally {
  database.sqlite.close();
}
