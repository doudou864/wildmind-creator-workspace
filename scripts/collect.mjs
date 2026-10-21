import { openDatabase } from '../src/db/database.ts';
import { notifyCollectorHealth } from '../src/jobs/collector-health.ts';
import { runCollection } from '../src/jobs/collect.ts';
const mode = process.argv.includes('--resume')
  ? 'resume'
  : process.argv.includes('--scheduled')
    ? 'scheduled'
    : 'manual';
try {
  await runCollection(
    mode,
    process.env.WORKSPACE_EGO_SPACE ? Number(process.env.WORKSPACE_EGO_SPACE) : undefined,
    process.argv.includes('--platform') ? process.argv[process.argv.indexOf('--platform') + 1] : undefined,
  );
} finally {
  const db = openDatabase();
  try {
    await notifyCollectorHealth(db);
  } finally {
    db.sqlite.close();
  }
}
