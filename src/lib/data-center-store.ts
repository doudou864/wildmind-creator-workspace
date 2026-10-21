import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import { posts, contents, topics, postSnapshots, reviewCheckpoints, dataInterpretations } from '../db/schema.ts';
import {
  ageAt,
  comparison,
  playbackDistribution,
  type AnalysisPost,
  type AnalysisMetric,
} from '../core/data-center.ts';
import { publicationTime } from '../core/review.ts';
import type { WorkspaceConfig } from './config.ts';
import type { DataCenterConfig } from './data-center-config.ts';
import {
  backfillNote,
  displayAnalysisValue,
  type DataCenterData,
  type InterpretationInput,
} from './data-center-model.ts';
import { CodexJudgment, type Judgment } from '../ai/structured.ts';
import { acquireJobLock } from '../jobs/lock.ts';
export function dataCenterData(
  db: WorkspaceDatabase,
  config: WorkspaceConfig,
  settings: DataCenterConfig,
  postId?: string,
  now = new Date(),
): DataCenterData {
  const content = db.db.select().from(contents).all(),
    topic = db.db.select().from(topics).all();
  const all: AnalysisPost[] = db.db
    .select()
    .from(posts)
    .all()
    .filter(
      (p) => p.platformId === settings.platformId && p.publishedAt && publicationTime(p.publishedAt) <= now.getTime(),
    )
    .flatMap((p) => {
      const c = content.find((c) => c.id === p.contentId);
      if (!c || c.fixture || topic.find((t) => t.id === c.topicId)?.fixture) return [];
      const metric = config.metrics.find(
        (m) =>
          m.scope === 'post' &&
          m.name === settings.viewsName &&
          m.bindings.some((b) => b.platformId === p.platformId && (b.form === c.form || b.form === 'all')),
      );
      return metric
        ? [
            {
              id: p.id,
              title: p.title,
              platformId: p.platformId,
              form: c.form,
              publishedAt: p.publishedAt!,
              metricId: metric.id,
              fire: topic.find((t) => t.id === c.topicId)?.frozenFire ?? null,
            },
          ]
        : [];
    })
    .sort((a, b) => publicationTime(b.publishedAt) - publicationTime(a.publishedAt) || a.id.localeCompare(b.id));
  const selected = postId ? (all.find((p) => p.id === postId) ?? null) : (all[0] ?? null);
  if (postId && !selected) throw Error('该作品不在当前数据中心范围内');
  const days = [...new Set([...config.parameters.checkpoints, ...config.parameters.anomalyCheckpoints])].sort(
    (a, b) => a - b,
  );
  const result: DataCenterData = {
    posts: all,
    selected,
    age: selected ? ageAt(selected, now.getTime()) : 0,
    minimum: config.parameters.baselineMinimum,
    hitThreshold: config.parameters.hitThreshold,
    ratio: null,
    ratioDay: null,
    endDay: settings.endDay,
    checkpoints: days,
    curve: [],
    playbackDays: settings.playback.days,
    playback: {},
    comparisons: {},
    fingerprints: {},
    interpretations: [],
  };
  if (!selected) return result;
  const samples = db.db
    .select()
    .from(postSnapshots)
    .all()
    .filter((s) => all.some((p) => p.id === s.postId));
  for (const day of settings.playback.days) {
    result.playback[day] = playbackDistribution(selected, all, samples, day, now.getTime(), settings.playback);
  }
  const options = {
    minimum: config.parameters.baselineMinimum,
    limit: config.parameters.baselineSamples,
    per: settings.per,
  };
  const metrics: AnalysisMetric[] = config.metrics
    .filter(
      (m) =>
        m.scope === 'post' &&
        m.kind === 'number' &&
        m.level !== 'dropped' &&
        m.bindings.some(
          (b) => b.platformId === settings.platformId && (b.form === selected.form || b.form === 'all'),
        ) &&
        samples.some((s) => s.metricId === m.id),
    )
    .map((m) => ({
      id: m.id,
      name: m.name,
      unit: m.unit,
      direction: m.direction,
      normalization: settings.interactionNames.includes(m.name)
        ? 'per_view'
        : settings.interactionRateNames.includes(m.name)
          ? 'percent_to_per_view'
          : 'raw',
    }));
  const views =
    metrics.find((m) => m.id === selected.metricId) ??
    ({
      id: selected.metricId,
      name: settings.viewsName,
      unit: '次',
      direction: 'higher',
      normalization: 'raw',
    } as AnalysisMetric);
  result.curve = Array.from({ length: settings.endDay }, (_, i) =>
    comparison(selected, all, samples, views, i + 1, now.getTime(), options, true),
  );
  for (const day of days.filter((d) => d <= result.age)) {
    const rows = metrics.map((m) => comparison(selected, all, samples, m, day, now.getTime(), options));
    result.comparisons[day] = rows.sort((a, b) => Number(b.conclusion === '偏低') - Number(a.conclusion === '偏低'));
    const numbers: InterpretationInput = { day, minimum: result.minimum, rows: result.comparisons[day] };
    result.fingerprints[day] = createHash('sha256')
      .update(JSON.stringify([selected.id, numbers]))
      .digest('hex');
  }
  const latest = result.curve
    .map((row, i) => ({ row, day: i + 1 }))
    .filter((x) => x.row.value != null)
    .at(-1);
  const final = db.db
    .select()
    .from(reviewCheckpoints)
    .all()
    .find((p) => p.postId === selected.id && p.metricId === selected.metricId && p.day === settings.endDay);
  if (result.age >= settings.endDay) {
    const point = final?.result;
    const row = comparison(selected, all, samples, views, settings.endDay, now.getTime(), options);
    result.ratio = point
      ? point.ratio
      : row.value != null && row.median != null && row.median > 0
        ? row.value / row.median
        : null;
    result.ratioDay = settings.endDay;
  } else if (latest) {
    result.ratio = latest.row.median != null && latest.row.median > 0 ? latest.row.value! / latest.row.median : null;
    result.ratioDay = latest.day;
  }
  result.interpretations = db.db
    .select()
    .from(dataInterpretations)
    .where(eq(dataInterpretations.postId, selected.id))
    .all()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}
export function composeInterpretation(
  input: InterpretationInput,
  ai: { cause: string; action: string },
  maxCharacters: number,
) {
  const rows = input.rows,
    low = rows.filter((r) => r.conclusion === '偏低');
  const missing = rows.some((r) => r.value == null) || !rows.length,
    insufficient = rows.some((r) => r.count < input.minimum);
  const allNormal = rows.length > 0 && rows.every((r) => r.conclusion === '正常');
  const summary = allNormal
    ? '各项都在正常范围'
    : low.length
      ? '部分指标比平时差'
      : insufficient
        ? '样本不足，不下结论'
        : missing
          ? '没有数据'
          : rows.some((r) => r.conclusion === '偏高')
            ? '部分指标比平时好'
            : '暂不下结论';
  const caveat = [missing ? '部分指标没有数据' : '', insufficient ? '样本不足，不下结论' : '']
    .filter(Boolean)
    .join('；');
  const detail = (limit: number) =>
    low
      .slice(0, limit)
      .map(
        (r) =>
          `${r.name}${r.approximate ? '约' : ''}${displayAnalysisValue(r.value)}，中位${displayAnalysisValue(r.median)}${r.unit}`,
      )
      .join('；') ||
    caveat ||
    '没有偏低项';
  const backfills = [
    ...new Set(
      rows.flatMap((r) => {
        const note = backfillNote(r, input.day);
        return note ? [note] : [];
      }),
    ),
  ];
  // Compact provenance still explicitly states the requested and actual ages.
  const ages = [
    ...new Set(
      rows.flatMap((r) => [
        ...(r.actualDay != null && r.actualDay > input.day ? [r.actualDay] : []),
        ...r.peerBackfills.map((p) => p.actualDay),
      ]),
    ),
  ];
  const note = backfills.length ? `含补抓：D${input.day} 补抓于 ${ages.map((d) => `D${d}`).join('、')}。` : '';
  const make = (limit: number) => [
    summary + '。',
    detail(limit) + (low.length && caveat ? '；' + caveat : '') + '。',
    `推测：${ai.cause}。${note}`,
    `下条试试：${ai.action}。`,
  ];
  let paragraphs = make(2);
  if (paragraphs.join('').length > maxCharacters) paragraphs = make(1);
  if (paragraphs.join('').length > maxCharacters) throw Error('解读超过字数限制，生成失败，可重试');
  return paragraphs;
}
const commentarySchema = z
  .object({ cause: z.string().trim().min(1).max(20), action: z.string().trim().min(1).max(20) })
  .strict();
export async function generateInterpretation(
  db: WorkspaceDatabase,
  config: WorkspaceConfig,
  settings: DataCenterConfig,
  postId: string,
  input: unknown,
  judgment: Judgment = new CodexJudgment(),
) {
  const { day, fingerprint } = z
    .object({ day: z.number().int().positive(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) })
    .strict()
    .parse(input);
  const data = dataCenterData(db, config, settings, postId);
  if (!data.comparisons[day] || data.fingerprints[day] !== fingerprint) throw Error('检查点数据已更新，请刷新后再生成');
  const existing = data.interpretations.find((r) => r.fingerprint === fingerprint);
  if (existing) return existing;
  const release = await acquireJobLock(path.join(path.dirname(db.filename), 'jobs', `interpret-${fingerprint}.lock`));
  if (!release) throw Error('解读正在生成，请稍后刷新查看');
  try {
    const cached = db.db
      .select()
      .from(dataInterpretations)
      .where(eq(dataInterpretations.fingerprint, fingerprint))
      .get();
    if (cached) return cached;
    const numbers: InterpretationInput = { day, minimum: data.minimum, rows: data.comparisons[day] };
    const ai = commentarySchema.parse(
      await judgment.read(commentarySchema, settings.ai.prompt + '\n' + JSON.stringify(numbers)),
    );
    if (/[0-9０-９]/.test(ai.cause + ai.action)) throw Error('解读包含数字表以外的数字表达，生成失败，可重试');
    const paragraphs = composeInterpretation(numbers, ai, settings.ai.maxCharacters);
    const record = {
      id: randomUUID(),
      postId,
      day,
      fingerprint,
      numbers,
      paragraphs,
      createdAt: new Date().toISOString(),
    };
    db.db.insert(dataInterpretations).values(record).run();
    return record;
  } finally {
    await release();
  }
}
