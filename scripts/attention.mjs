import { openDatabase } from '../src/db/database.ts';
import { pendingAttention } from '../src/jobs/attention.ts';
const database = openDatabase();
try {
  console.log(JSON.stringify(pendingAttention(database), null, 2));
} finally {
  database.sqlite.close();
}
