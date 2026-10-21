import { usingDatabase } from '@/lib/media-store';
import { currentHealth } from '@/jobs/collector-health';
export async function GET() {
  return Response.json(
    await usingDatabase(async (db) => ({
      warnings: await currentHealth(db),
      // Compatibility fields; the dashboard never discovers local files.
      newVideos: [],
      fileErrors: [],
    })),
  );
}
