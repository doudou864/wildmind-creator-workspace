import { eq, and } from 'drizzle-orm';
import { openDatabase } from '../src/db/database.ts';
import { imageTasks } from '../src/db/schema.ts';
import { generateAssets } from '../src/lib/media-store.ts';
import { imageFailure } from '../src/ai/image-generation.ts';
const [id, filename] = process.argv.slice(2);
const db = openDatabase(filename);
try {
  const task = db.db.select().from(imageTasks).where(eq(imageTasks.id, id)).get();
  if (!task || task.status !== 'queued') process.exitCode = 1;
  else {
    const claimed = db.db
      .update(imageTasks)
      .set({ status: 'running', pid: process.pid, updatedAt: new Date().toISOString() })
      .where(and(eq(imageTasks.id, id), eq(imageTasks.status, 'queued')))
      .run();
    if (claimed.changes === 1) {
      try {
        const result = await generateAssets(db, task.input);
        db.db
          .update(imageTasks)
          .set({ status: 'success', assetIds: result.assets.map((a) => a.id), updatedAt: new Date().toISOString() })
          .where(eq(imageTasks.id, id))
          .run();
      } catch (error) {
        db.db
          .update(imageTasks)
          .set({ status: 'failed', reason: imageFailure(error), updatedAt: new Date().toISOString() })
          .where(eq(imageTasks.id, id))
          .run();
      }
    }
  }
} finally {
  db.sqlite.close();
}
