import { watchCollectionCancellation } from '../src/jobs/cancellation.ts';
import { startCollection } from '../src/jobs/collection-control.ts';
import { openDatabase } from '../src/db/database.ts';
import { notifyCollectorHealth } from '../src/jobs/collector-health.ts';
import { runCollection } from '../src/jobs/collect.ts';
const mode = process.argv.includes('--resume')
  ? 'resume'
  : process.argv.includes('--scheduled')
    ? 'scheduled'
    : 'manual';
const platform = process.argv.includes('--platform') ? process.argv[process.argv.indexOf('--platform') + 1] : undefined;
if (!platform) {
  console.log(JSON.stringify(await startCollection(undefined, mode)));
} else {
  const stopWatching = watchCollectionCancellation(platform);
  try {
    await runCollection(
      mode,
      process.env.WORKSPACE_EGO_SPACE ? Number(process.env.WORKSPACE_EGO_SPACE) : undefined,
      platform,
    );
  } finally {
    stopWatching();
    const db = openDatabase();
    try {
      await notifyCollectorHealth(db);
    } finally {
      db.sqlite.close();
    }
  }
}
