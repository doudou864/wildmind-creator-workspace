import { usingDatabase } from '@/lib/media-store';
import { currentHealth } from '@/jobs/collector-health';
import { listLocalVideos } from '@/lib/local-videos';
import { publishVideos } from '@/db/schema';
export async function GET() {
  const listing = await listLocalVideos();
  return Response.json(
    await usingDatabase(async (db) => ({
      warnings: await currentHealth(db),
      newVideos: listing.items.filter(
        (file) =>
          !db.db
            .select()
            .from(publishVideos)
            .all()
            .some((v) => v.path === file.path),
      ),
      fileErrors: listing.errors,
    })),
  );
}
