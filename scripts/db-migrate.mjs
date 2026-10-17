import { initializeDatabase } from '../src/db/database.ts';
const database = await initializeDatabase();
console.log(`数据库已就绪：${database.filename}（WAL，迁移前已备份）`);
database.sqlite.close();
