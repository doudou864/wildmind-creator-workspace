import type { Checkpoint, HitRatePeriod } from '../lib/workspace-model';
export type ReviewPost = {
  id: string;
  platformId: string;
  form: string;
  metricId: string;
  publishedAt: string;
  topicId: string | null;
  automatic: boolean;
  fire: boolean | null;
};
export type ReviewSample = {
  id: string;
  postId: string;
  metricId: string;
  capturedAt: string;
  value: number | null;
  backfillKind: string;
};
export type FrozenPoint = Checkpoint & { snapshotId: string; baselinePostIds: string[] };
export type ReviewOptions = { baselineSamples: number; baselineMinimum: number; hitThreshold: number };
export const publicationTime = (value: string) => Date.parse(value.length === 10 ? `${value}T00:00:00+08:00` : value);
const dayMs = 86400000;
export function firstSample(post: ReviewPost, samples: ReviewSample[], day: number, asOf: number) {
  const due = publicationTime(post.publishedAt) + day * dayMs;
  return samples
    .filter(
      (s) =>
        s.postId === post.id &&
        s.metricId === post.metricId &&
        s.value !== null &&
        Number.isFinite(s.value) &&
        Date.parse(s.capturedAt) >= due &&
        Date.parse(s.capturedAt) <= asOf,
    )
    .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || a.id.localeCompare(b.id))[0];
}
export function reviewCheckpoint(
  post: ReviewPost,
  all: ReviewPost[],
  samples: ReviewSample[],
  day: number,
  now: number,
  options: ReviewOptions,
  frozen?: FrozenPoint,
): Checkpoint | FrozenPoint {
  if (frozen) return frozen;
  const due = publicationTime(post.publishedAt) + day * dayMs;
  const empty: Checkpoint = {
    ratio: null,
    baseline: null,
    samples: 0,
    capturedAt: null,
    status: now < due ? 'pending' : 'missing',
    provenance: 'exact',
    reason: now < due ? null : '检查点尚无有效采集值',
  };
  const current = firstSample(post, samples, day, now);
  if (!current) return empty;
  const candidates = all
    .filter(
      (p) =>
        p.id !== post.id && p.platformId === post.platformId && p.form === post.form && p.metricId === post.metricId,
    )
    .map((p) => ({ post: p, sample: firstSample(p, samples, day, Date.parse(current.capturedAt)) }))
    .filter((p) => p.sample !== undefined)
    .sort(
      (a, b) =>
        publicationTime(b.post.publishedAt) - publicationTime(a.post.publishedAt) || a.post.id.localeCompare(b.post.id),
    )
    .slice(0, options.baselineSamples);
  const values = candidates.map((c) => c.sample!.value!).sort((a, b) => a - b);
  const baseline = values.length
    ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2
    : null;
  const sufficient = values.length >= options.baselineMinimum;
  const usable = sufficient && baseline !== null && baseline > 0;
  return {
    ratio: usable ? current.value! / baseline : null,
    baseline,
    samples: values.length,
    capturedAt: current.capturedAt,
    status: usable ? 'ready' : 'insufficient',
    provenance:
      current.backfillKind === 'historical'
        ? 'historical'
        : current.backfillKind === 'checkpoint' || Date.parse(current.capturedAt) >= due + dayMs
          ? 'backfill'
          : 'exact',
    reason: !sufficient ? `同龄样本不足${options.baselineMinimum}条` : !usable ? '同龄基线为0，不能计算倍数' : null,
    snapshotId: current.id,
    baselinePostIds: candidates.map((c) => c.post.id),
  };
}
export function trend(points: Record<string, Checkpoint>, threshold: number) {
  const early = points['3']?.ratio,
    mature = points['21']?.ratio;
  if (early == null || mature == null) return '待定';
  return early >= threshold ? (mature >= threshold ? '爆发型' : '昙花型') : mature >= threshold ? '长尾型' : '未命中';
}
export function firstPublications(posts: ReviewPost[]) {
  const seen = new Set<string>();
  const ids = new Set<string>();
  for (const p of [...posts].sort(
    (a, b) => publicationTime(a.publishedAt) - publicationTime(b.publishedAt) || a.id.localeCompare(b.id),
  )) {
    if (!p.topicId) continue;
    const key = JSON.stringify([p.platformId, p.topicId]);
    if (!seen.has(key)) {
      seen.add(key);
      ids.add(p.id);
    }
  }
  return ids;
}
export function hitRates(
  posts: ReviewPost[],
  points: Record<string, Record<string, Checkpoint>>,
  options: { reviewPlatforms: string[]; hitThreshold: number; conclusionMinimum: number },
  now: Date,
): HitRatePeriod[] {
  const month = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 7);
  const currentMonth = month(now.getTime());
  const first = firstPublications(posts);
  const eligible = posts.filter(
    (p) =>
      first.has(p.id) &&
      !p.automatic &&
      p.fire !== null &&
      options.reviewPlatforms.includes(p.platformId) &&
      publicationTime(p.publishedAt) <= now.getTime(),
  );
  const keys = [...new Set(eligible.map((p) => `${p.platformId}/${month(publicationTime(p.publishedAt))}`))];
  return keys.map((key) => {
    const [platformId, period] = key.split('/');
    const phase = period === currentMonth ? 'estimated' : 'final';
    const checkpoint = phase === 'estimated' ? '7' : '21';
    const rows = eligible.filter(
      (p) => p.platformId === platformId && month(publicationTime(p.publishedAt)) === period,
    );
    const mature = eligible.filter((p) => p.platformId === platformId && points[p.id]?.['21']?.ratio != null).length;
    return {
      platformId,
      month: period,
      phase,
      conclusionAllowed: mature >= options.conclusionMinimum,
      groups: ([true, false] as const).map((fire) => {
        const group = rows.filter((p) => p.fire === fire);
        const complete = group.filter((p) => points[p.id]?.[checkpoint]?.ratio != null);
        return {
          group: fire ? 'fire' : 'non-fire',
          total: group.length,
          completed: complete.length,
          hits: complete.filter((p) => points[p.id][checkpoint].ratio! >= options.hitThreshold).length,
        };
      }),
    };
  });
}
