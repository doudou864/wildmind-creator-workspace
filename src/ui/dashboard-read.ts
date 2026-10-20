import { contents, topics, posts, postSnapshots, reviewCheckpoints } from '../db/schema';
import type { WorkspaceDatabase } from '../db/database';
import type { WorkspaceConfig } from '../lib/config';
import { firstPublications, publicationTime, type ReviewPost } from '../core/review';
// Server presentation data, not an API or a new metric. All values come from saved readings.
export function dashboardRead(database: WorkspaceDatabase, config: WorkspaceConfig) {
  const allPosts = database.db.select().from(posts).all(),
    allContents = database.db.select().from(contents).all(),
    allTopics = database.db.select().from(topics).all();
  const samples = database.db.select().from(postSnapshots).all(),
    points = database.db.select().from(reviewCheckpoints).all();
  const review: ReviewPost[] = allPosts.flatMap((p) => {
    const c = allContents.find((c) => c.id === p.contentId),
      t = allTopics.find((t) => t.id === c?.topicId),
      platform = config.platforms.find((x) => x.id === p.platformId);
    if (!c || c.fixture || t?.fixture || !p.publishedAt || !platform) return [];
    const metric = config.metrics.find(
      (m) =>
        m.scope === 'post' &&
        m.kind === 'number' &&
        m.name === (platform.reviewMetricByForm?.[c.form] ?? platform.reviewMetric) &&
        m.bindings.some((b) => b.platformId === p.platformId && (b.form === c.form || b.form === 'all')),
    );
    return metric
      ? [
          {
            id: p.id,
            platformId: p.platformId,
            form: c.form,
            metricId: metric.id,
            publishedAt: p.publishedAt,
            topicId: c.topicId,
            automatic: t?.automatic ?? true,
            fire: t?.frozenFire ?? null,
          },
        ]
      : [];
  });
  const first = firstPublications(review);
  const mature = Object.fromEntries(
    config.parameters.reviewPlatforms.map((platform) => [
      platform,
      review.filter(
        (p) =>
          p.platformId === platform &&
          first.has(p.id) &&
          !p.automatic &&
          p.fire !== null &&
          publicationTime(p.publishedAt) <= Date.now() &&
          points.some((r) => r.postId === p.id && r.metricId === p.metricId && r.day === 21 && r.result.ratio !== null),
      ).length,
    ]),
  );
  const readings = Object.fromEntries(
    allPosts.map((p) => {
      const c = allContents.find((c) => c.id === p.contentId),
        platform = config.platforms.find((x) => x.id === p.platformId);
      const metric = config.metrics.find(
        (m) =>
          m.scope === 'post' &&
          m.name === (platform?.reviewMetricByForm?.[c?.form ?? ''] ?? platform?.reviewMetric) &&
          m.bindings.some((b) => b.platformId === p.platformId && (b.form === c?.form || b.form === 'all')),
      );
      const latest = samples
        .filter((s) => s.postId === p.id && s.metricId === metric?.id && s.value !== null)
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
      return [
        p.id,
        {
          value: latest?.value ?? null,
          capturedAt: latest?.capturedAt ?? null,
          precision: latest?.precision ?? 'unknown',
          name: metric?.name ?? '累计值',
          publishedAt: p.publishedAt,
        },
      ];
    }),
  );
  return { readings, mature };
}
export type DashboardRead = ReturnType<typeof dashboardRead>;
