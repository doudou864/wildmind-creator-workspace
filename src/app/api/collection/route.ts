import { shanghaiDate } from '@/jobs/schedule';
import { pendingAttention } from '@/jobs/attention';
import { crawlLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { isLocalOrigin } from '@/lib/local-origin';
import { startCollection, runningPlatforms, legacyCollectionRunning, stopCollection } from '@/jobs/collection-control';
import { usingDatabase } from '@/lib/media-store';
import { loadSchedule } from '@/jobs/schedule';
import { readState } from '@/collectors/state';
export async function GET() {
  const legacyRunning = await legacyCollectionRunning();
  const activePlatforms = legacyRunning
    ? await usingDatabase(async (db) =>
        db.db
          .select({ id: crawlLogs.platformId })
          .from(crawlLogs)
          .where(eq(crawlLogs.status, 'running'))
          .all()
          .map((r) => r.id),
      )
    : await runningPlatforms();
  const issues = await usingDatabase(async (db) => {
    const { platforms } = await loadSchedule();
    return platforms.flatMap((platform) => {
      const value = readState(db, `collection:last-error:${platform}`);
      return value?.reason ? [{ platform, ...value }] : [];
    });
  });
  return Response.json({
    today: shanghaiDate(),
    attention: await usingDatabase(async (db) =>
      pendingAttention(db).map((item) => ({ platform: item.platformId, reason: item.reason, at: item.updatedAt })),
    ),
    running: legacyRunning || activePlatforms.length > 0,
    legacyRunning,
    activePlatforms,
    issues,
    issue: issues[0] ?? null,
  });
}
export async function POST(request: Request) {
  if (!isLocalOrigin(request)) return Response.json({ error: '请从本机工作台启动采集' }, { status: 403 });
  try {
    const body = await request.json();
    if (body.action !== undefined && body.action !== 'stop') throw Error('采集操作无效');
    if (body.platform !== undefined && typeof body.platform !== 'string') throw Error('平台参数无效');
    return Response.json(
      body.action === 'stop' ? await stopCollection(body.platform) : await startCollection(body.platform),
      { status: 202 },
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : '无法启动采集' }, { status: 409 });
  }
}
