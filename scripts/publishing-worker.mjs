import { openDatabase } from '../src/db/database.ts';
import { runPublishingSubmit } from '../src/jobs/publishing-submit.ts';
import { runPublishingUpload } from '../src/jobs/publishing-worker.ts';
const [id, token, filename, operation] = process.argv.slice(2);
const db = openDatabase(filename);
try {
  if (operation === 'publish') await runPublishingSubmit(db, id, token);
  else await runPublishingUpload(db, id, token);
} finally {
  db.sqlite.close();
}
