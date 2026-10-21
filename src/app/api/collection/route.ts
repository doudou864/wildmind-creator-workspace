import { startCollection, collectionRunning } from '@/jobs/collection-control';
import { usingDatabase } from '@/lib/media-store';
import { crawlLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { readState } from '@/collectors/state';
export async function GET() {
  return Response.json({
    running: await collectionRunning(),
    activePlatforms: await usingDatabase(async (db) =>
      db.db
        .select({ platformId: crawlLogs.platformId })
        .from(crawlLogs)
        .where(eq(crawlLogs.status, 'running'))
        .all()
        .map((r) => r.platformId),
    ),
    issue: await usingDatabase(async (db) => readState(db, 'collection:last-error') ?? null),
  });
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: '请从本机工作台启动采集' }, { status: 403 });
  try {
    const body = await request.json();
    if (body.platform !== undefined && typeof body.platform !== 'string') throw Error('平台参数无效');
    return Response.json(await startCollection(body.platform), { status: 202 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '无法启动采集' }, { status: 409 });
  }
}
