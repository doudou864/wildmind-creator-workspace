import { publicationTime, firstSample, latestDailySamples, type ReviewSample } from './review.ts';
import { quantile } from './statistics.ts';
export type AnalysisPost = {
  id: string;
  title: string;
  platformId: string;
  form: string;
  publishedAt: string;
  metricId: string;
  fire: boolean | null;
};
export type AnalysisMetric = {
  id: string;
  name: string;
  unit: string;
  direction: 'higher' | 'lower';
  normalization: 'raw' | 'per_view' | 'percent_to_per_view';
};
export type Comparison = {
  id: string;
  name: string;
  unit: string;
  direction: 'higher' | 'lower';
  value: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  count: number;
  conclusion: '偏低' | '正常' | '偏高' | null;
  status: 'ready' | 'missing' | 'insufficient';
  approximate?: boolean;
  actualDay: number | null;
  capturedAt: string | null;
  peerBackfills: { id: string; actualDay: number }[];
};
export const ageAt = (post: AnalysisPost, time: number) =>
  Math.floor((time - publicationTime(post.publishedAt)) / 86400000);
function reviewPost(post: AnalysisPost, metricId = post.metricId) {
  return { ...post, metricId, topicId: null, automatic: true };
}
export function dailySample(post: AnalysisPost, samples: ReviewSample[], day: number, asOf: number) {
  const row = firstSample(reviewPost(post), samples, day, asOf);
  return row && ageAt(post, Date.parse(row.capturedAt)) === day ? row : undefined;
}
export function comparison(
  post: AnalysisPost,
  all: AnalysisPost[],
  samples: ReviewSample[],
  metric: AnalysisMetric,
  day: number,
  asOf: number,
  options: { minimum: number; limit: number; per: number },
  daily = false,
): Comparison {
  const pick = (p: AnalysisPost, cutoff: number) =>
    daily
      ? dailySample({ ...p, metricId: metric.id }, samples, day, cutoff)
      : firstSample(reviewPost(p, metric.id), samples, day, cutoff);
  const current = pick(post, asOf);
  const valueOf = (p: AnalysisPost, row: ReviewSample | undefined): number | null => {
    if (row?.value == null) return null;
    if (metric.normalization === 'percent_to_per_view') return (row.value * options.per) / 100;
    if (metric.normalization === 'raw') return row.value;
    const denominator = samples.find(
      (s) => s.postId === p.id && s.metricId === p.metricId && s.capturedAt === row.capturedAt,
    )?.value;
    return denominator != null && denominator > 0 ? (row.value / denominator) * options.per : null;
  };
  const cutoff = current ? Date.parse(current.capturedAt) : asOf;
  const pool = all
    .filter(
      (p) =>
        p.id !== post.id &&
        p.platformId === post.platformId &&
        p.form === post.form &&
        publicationTime(p.publishedAt) < publicationTime(post.publishedAt),
    )
    .sort((a, b) => publicationTime(b.publishedAt) - publicationTime(a.publishedAt) || a.id.localeCompare(b.id))
    .map((p) => {
      const row = pick(p, cutoff);
      return { post: p, row, value: valueOf(p, row) };
    })
    .filter((r) => r.value !== null)
    .slice(0, options.limit);
  const values = pool.map((p) => p.value!);
  const sufficient = values.length >= options.minimum;
  const value = valueOf(post, current),
    p25 = sufficient ? quantile(values, 0.25) : null,
    p75 = sufficient ? quantile(values, 0.75) : null;
  const position = value == null || p25 == null || p75 == null ? null : value < p25 ? -1 : value > p75 ? 1 : 0;
  const direction = metric.direction === 'lower' ? -1 : 1;
  return {
    id: metric.id,
    name: metric.name,
    unit: metric.normalization === 'raw' ? metric.unit : `次/千播放`,
    direction: metric.direction,
    value,
    median: sufficient ? quantile(values, 0.5) : null,
    p25,
    p75,
    count: pool.length,
    conclusion:
      position == null ? null : position * direction < 0 ? '偏低' : position * direction > 0 ? '偏高' : '正常',
    status: value == null ? 'missing' : sufficient ? 'ready' : 'insufficient',
    ...((current as (ReviewSample & { precision?: string }) | undefined)?.precision === 'display'
      ? { approximate: true }
      : {}),
    actualDay: current ? ageAt(post, Date.parse(current.capturedAt)) : null,
    capturedAt: current?.capturedAt ?? null,
    peerBackfills: pool.flatMap((p) =>
      p.row && ageAt(p.post, Date.parse(p.row.capturedAt)) > day
        ? [{ id: p.post.id, actualDay: ageAt(p.post, Date.parse(p.row.capturedAt)) }]
        : [],
    ),
  };
}

export type WorkPlayback = {
  id: string;
  title: string;
  value: number | null;
  capturedAt: string | null;
  approximate: boolean;
};
export type PlaybackDistribution = {
  rows: WorkPlayback[];
  median: number | null;
  count: number;
  min: number | null;
  max: number | null;
};
// Calendar days in the workspace timezone: the publication date is D0.
export function playbackDistribution(
  selected: AnalysisPost,
  posts: AnalysisPost[],
  samples: ReviewSample[],
  day: number,
  asOf: number,
  options: { timeZone: string; axisPadding: number },
): PlaybackDistribution {
  const date = (time: number) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: options.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(time));
  const calendarAge = (post: AnalysisPost, time: number) =>
    Math.round((Date.parse(date(time)) - Date.parse(date(publicationTime(post.publishedAt)))) / 86400000);
  const rows = posts
    .filter(
      (p) => p.platformId === selected.platformId && p.form === selected.form && publicationTime(p.publishedAt) <= asOf,
    )
    .sort((a, b) => publicationTime(a.publishedAt) - publicationTime(b.publishedAt) || a.id.localeCompare(b.id))
    .map((p) => {
      const sample = latestDailySamples(samples, asOf)
        .filter(
          (s) =>
            s.postId === p.id &&
            s.metricId === p.metricId &&
            s.value !== null &&
            Number.isFinite(s.value) &&
            Date.parse(s.capturedAt) <= asOf &&
            calendarAge(p, Date.parse(s.capturedAt)) === day,
        )
        .sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt) || a.id.localeCompare(b.id))[0];
      return {
        id: p.id,
        title: p.title,
        value: sample?.value ?? null,
        capturedAt: sample?.capturedAt ?? null,
        approximate: (sample as (ReviewSample & { precision?: string }) | undefined)?.precision === 'display',
      };
    });
  const values = rows.flatMap((r) => (r.value === null ? [] : [r.value]));
  return {
    rows,
    count: values.length,
    median: quantile(values, 0.5),
    min: values.length ? Math.min(...values) - options.axisPadding : null,
    max: values.length ? Math.max(...values) + options.axisPadding : null,
  };
}
