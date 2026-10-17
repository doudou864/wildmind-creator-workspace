import { openDatabase } from '../src/db/database.ts';
import { loadConfig } from '../src/lib/config.ts';
import { showData } from '../src/jobs/data-show.ts';
const database = openDatabase();
try {
  console.log(showData(database, await loadConfig(), process.argv[2]));
} finally {
  database.sqlite.close();
}
