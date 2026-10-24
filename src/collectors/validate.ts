import type { WorkspaceConfig } from '../lib/config.ts';
import { metricFor, type CapturedReading, type CollectedPost } from './storage.ts';
export function missingDailyPostMetrics(
  config: WorkspaceConfig,
  platformId: string,
  post: CollectedPost,
  readings: CapturedReading[],
  aliases: Record<string, string>,
) {
  const seen = new Set(
    readings.flatMap((r) =>
      (r.postKey && r.postKey !== post.key ? [] : r.reading.posts)
        .filter((p) => p.title === post.title && p.publishedAt === post.publishedAt)
        .flatMap((p) => p.metrics.map((m) => metricFor(config, platformId, 'post', post.form, m.label, aliases)?.id)),
    ),
  );
  return config.metrics.filter(
    (m) =>
      m.scope === 'post' &&
      m.kind === 'number' &&
      m.bindings.some(
        (b) =>
          b.platformId === platformId &&
          (b.form === post.form || b.form === 'all') &&
          b.level === 'core' &&
          b.status === 'confirmed' &&
          b.frequency === 'daily',
      ) &&
      !seen.has(m.id),
  );
}
export function requireCoreMetrics(
  config: WorkspaceConfig,
  platformId: string,
  incoming: CollectedPost[],
  readings: CapturedReading[],
  aliases: Record<string, string>,
  accountAliases: Record<string, string>,
  requireCheckpoints: (post: CollectedPost) => boolean = () => true,
) {
  for (const post of incoming) {
    const seen = new Set(
      readings.flatMap((r) =>
        (r.postKey && r.postKey !== post.key ? [] : r.reading.posts)
          .filter((p) => p.title === post.title && p.publishedAt === post.publishedAt)
          .flatMap((p) => p.metrics.map((m) => metricFor(config, platformId, 'post', post.form, m.label, aliases)?.id)),
      ),
    );
    const missing = config.metrics.filter(
      (m) =>
        m.kind === 'number' &&
        m.scope === 'post' &&
        m.bindings.some(
          (b) =>
            b.platformId === platformId &&
            (b.form === post.form || b.form === 'all') &&
            b.status === 'confirmed' &&
            b.level === 'core' &&
            (b.frequency !== 'checkpoints' || requireCheckpoints(post)),
        ) &&
        !seen.has(m.id),
    );
    if (missing.length) throw new Error(`${post.title}核心指标缺失：${missing.map((m) => m.name).join('、')}`);
  }
  const dates = new Set(
    readings.filter((r) => r.reading.account.metrics.length).map((r) => r.reading.account.dataDate),
  );
  if (!dates.size) throw new Error('账号数据缺失');
  for (const date of dates) {
    const seen = new Set(
      readings
        .filter((r) => r.reading.account.dataDate === date)
        .flatMap((r) =>
          r.reading.account.metrics.map(
            (m) => metricFor(config, platformId, 'account', 'all', m.label, accountAliases)?.id,
          ),
        ),
    );
    const missing = config.metrics.filter(
      (m) =>
        m.kind === 'number' &&
        m.scope === 'account' &&
        m.bindings.some(
          (b) =>
            b.platformId === platformId && b.status === 'confirmed' && b.level === 'core' && b.method !== 'derived',
        ) &&
        !seen.has(m.id),
    );
    if (missing.length) throw new Error(`${date}账号核心指标缺失：${missing.map((m) => m.name).join('、')}`);
  }
}
