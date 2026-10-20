import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { posts, contents, topics, postSnapshots, reviewCheckpoints } from '../db/schema.ts';
import type { WorkspaceConfig } from './config.ts';
import {
  reviewCheckpoint,
  trend,
  firstPublications,
  hitRates,
  type ReviewPost,
  type FrozenPoint,
} from '../core/review.ts';
import type { Checkpoint } from './workspace-model';
export function refreshReviews(database: WorkspaceDatabase, config: WorkspaceConfig, now = new Date()) {
  return database.db.transaction((tx) => {
    const stored = tx.select().from(posts).all();
    const contentRows = tx.select().from(contents).all();
    const topicRows = tx.select().from(topics).all();
    const rows: ReviewPost[] = stored.flatMap((p) => {
      const content = contentRows.find((c) => c.id === p.contentId);
      const topic = topicRows.find((t) => t.id === content?.topicId);
      const platform = config.platforms.find((c) => c.id === p.platformId);
      if (!content || content.fixture || topic?.fixture || !platform || !p.publishedAt) return [];
      const name = platform.reviewMetricByForm?.[content.form] ?? platform.reviewMetric;
      const metric = config.metrics.find(
        (m) =>
          m.scope === 'post' &&
          m.kind === 'number' &&
          m.name === name &&
          m.bindings.some((b) => b.platformId === p.platformId && (b.form === content.form || b.form === 'all')),
      );
      if (!metric) return [];
      return [
        {
          id: p.id,
          platformId: p.platformId,
          form: content.form,
          metricId: metric.id,
          publishedAt: p.publishedAt,
          topicId: content.topicId,
          automatic: topic?.automatic ?? true,
          fire: topic?.frozenFire ?? null,
        },
      ];
    });
    const samples = tx.select().from(postSnapshots).all();
    const frozen = tx.select().from(reviewCheckpoints).all();
    const points: Record<string, Record<string, Checkpoint>> = {};
    const first = firstPublications(rows);
    const days = [...new Set([...config.parameters.checkpoints, ...config.parameters.anomalyCheckpoints])];
    for (const post of rows) {
      points[post.id] = {};
      for (const day of days) {
        const old = frozen.find((f) => f.postId === post.id && f.metricId === post.metricId && f.day === day);
        const point = reviewCheckpoint(post, rows, samples, day, now.getTime(), config.parameters, old?.result);
        points[post.id][day] = point;
        if (!old && 'snapshotId' in point)
          tx.insert(reviewCheckpoints)
            .values({
              id: randomUUID(),
              postId: post.id,
              day,
              metricId: post.metricId,
              result: point as FrozenPoint,
              createdAt: now.toISOString(),
            })
            .run();
      }
      const result = points[post.id];
      const mature = result['21']?.ratio;
      tx.update(posts)
        .set({
          checkpointRatios: Object.fromEntries(Object.entries(result).map(([d, p]) => [d, p.ratio])),
          trend: trend(result, config.parameters.hitThreshold),
          hit: mature == null ? null : mature >= config.parameters.hitThreshold,
          firstPublication: first.has(post.id),
        })
        .where(eq(posts.id, post.id))
        .run();
    }
    return { posts: rows, points, hitRates: hitRates(rows, points, config.parameters, now) };
  });
}
