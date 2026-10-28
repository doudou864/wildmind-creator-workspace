import { desc, eq } from 'drizzle-orm';
import { crawlLogs } from '@/db/schema';
import { usingDatabase } from '@/lib/media-store';
import { loadSchedule } from '@/jobs/schedule';
import { readExecutionLog, redactDiagnostic } from '@/jobs/execution-log';
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const platform = query.get('platform');
  if (!platform || !(await loadSchedule()).platforms.includes(platform))
    return Response.json({ error: '平台无效' }, { status: 400 });
  return usingDatabase(async (db) => {
    const runs = db.db
      .select()
      .from(crawlLogs)
      .where(eq(crawlLogs.platformId, platform))
      .orderBy(desc(crawlLogs.startedAt))
      .limit(10)
      .all();
    const id = query.get('id');
    if (id && !runs.some((r) => r.id === id)) return Response.json({ error: '记录不存在' }, { status: 404 });
    return Response.json({
      runs: runs.map((r) => ({ ...r, reason: r.reason ? redactDiagnostic(r.reason) : null })),
      ...(id ? { events: readExecutionLog(db.filename, id) } : {}),
    });
  });
}
