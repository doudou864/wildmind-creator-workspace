import { assessReplies } from './inbox-model.ts';
import { inboxData } from './inbox-store.ts';
import { demandThemes } from '../db/schema.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
import type { WorkspaceConfig } from './config.ts';
import type { DashboardData, Day, PlatformData } from './workspace-model';
import { accountDaily, crawlLogs, posts, contents, attentionItems } from '../db/schema.ts';
import { refreshReviews } from './review-store.ts';
import { trend, publicationTime } from '../core/review.ts';
export function dashboardData(db: WorkspaceDatabase, config: WorkspaceConfig, now = new Date()): DashboardData {
  const review = refreshReviews(db, config, now);
  const logs = db.db
    .select()
    .from(crawlLogs)
    .all()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const daily = db.db.select().from(accountDaily).all();
  const allPosts = db.db.select().from(posts).all();
  const platforms: Record<string, PlatformData> = {};
  for (const platform of config.platforms) {
    const runs = logs.filter((r) => r.platformId === platform.id);
    const latest = runs[0];
    const days = new Map<string, Day>();
    for (const row of daily.filter((r) => r.platformId === platform.id)) {
      const day = days.get(row.dataDate) ?? { date: row.dataDate, values: {}, precision: {} };
      day.values[row.metricId] = row.value;
      day.precision![row.metricId] = row.precision;
      days.set(row.dataDate, day);
    }
    platforms[platform.id] = {
      status: latest?.status === 'running' ? 'pending' : (latest?.status ?? 'pending'),
      lastSuccess: runs.find((r) => r.status === 'success')?.finishedAt ?? null,
      error: latest?.reason ?? null,
      dataPending: latest?.status === 'success' ? latest.telemetry?.dataPending : undefined,
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      works: review.posts
        .filter((p) => p.platformId === platform.id)
        .sort((a, b) => publicationTime(b.publishedAt) - publicationTime(a.publishedAt))
        .map((p) => ({
          id: p.id,
          title: allPosts.find((r) => r.id === p.id)!.title,
          form: p.form,
          published: new Date(publicationTime(p.publishedAt) + 8 * 3600000).toISOString().slice(0, 10),
          checkpoints: review.points[p.id],
          state: trend(review.points[p.id], config.parameters.hitThreshold),
        })),
      baselines: Object.fromEntries(
        platform.forms.map((form) => {
          const latestPoint = review.posts
            .filter((p) => p.platformId === platform.id && p.form === form)
            .map((p) => review.points[p.id]['21'])
            .filter((p) => p?.status === 'ready')
            .sort((a, b) => (b.capturedAt ?? '').localeCompare(a.capturedAt ?? ''))[0];
          return [form, latestPoint?.baseline ?? null];
        }),
      ),
    };
  }
  const inbox = inboxData(db);
  const replies = assessReplies(inbox.items);
  return {
    platforms,
    hitRates: review.hitRates,
    collectionReady: true,
    reviewReady: true,
    questions: inbox.items
      .filter(
        (m) =>
          m.classification.status === 'ready' &&
          m.classification.result.category === 'idea' &&
          !['replied', 'low_value'].includes(replies.get(m.id)?.state ?? ''),
      )
      .map((m) => ({ id: m.id, title: m.body, platformId: m.platformId })),
    questionsReady: true,
    plannedContents: db.db
      .select()
      .from(contents)
      .all()
      .filter((c) => c.plannedDate !== null),
    plansReady: true,
    themes: db.db
      .select()
      .from(demandThemes)
      .all()
      .filter((t) => inbox.themes.some((visible) => visible.id === t.id))
      .map((t) => ({
        id: t.id,
        revision: t.revision,
        title: t.title,
        count: inbox.themes.find((visible) => visible.id === t.id)!.messageIds.length,
        signalId: t.signalId,
      })),
    themesReady: true,
    themeSyncReady: true,
    accountAlerts: [],
    accountAlertsReady: false,
    attention: db.db
      .select()
      .from(attentionItems)
      .all()
      .filter((a) => a.status === 'pending')
      .map((a) => ({ id: a.id, platformId: a.platformId, reason: a.reason })),
  };
}
