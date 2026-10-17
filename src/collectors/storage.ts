import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import {
  posts,
  contents,
  topics,
  publishReceipts,
  publishRecords,
  postSnapshots,
  accountDaily,
  accounts,
  rawRecords,
  topicSignals,
} from '../db/schema.ts';
import type { WorkspaceConfig } from '../lib/config.ts';
import type { Judgment } from '../ai/structured.ts';
import type { ScreenshotReading } from './recognition.ts';
import { shanghaiDate } from '../browser/policy.ts';
import {
  ageInDays,
  historicalKind,
  normalizeTitle,
  parseDisplayedNumber,
  withinRecentWindow,
} from '../core/collection.ts';
import { readState, writeState } from './state.ts';
export type CapturedReading = {
  sourcePath: string;
  capturedAt: string;
  reading: ScreenshotReading;
  postKey?: string;
  kind: 'list' | 'detail' | 'account';
};
export type CollectedPost = { key: string; title: string; publishedAt: string; form: '视频' | '图文' };
export const postKey = (platformId: string, title: string, publishedAt: string) =>
  createHash('sha256')
    .update([platformId, normalizeTitle(title), publishedAt].join('\n'))
    .digest('hex');
const labelKey = (s: string) => s.replace(/\s+/g, '');
export function metricFor(
  config: WorkspaceConfig,
  platformId: string,
  scope: 'account' | 'post',
  form: string,
  label: string,
  aliases: Record<string, string>,
) {
  const name = labelKey(aliases[label] ?? label);
  return config.metrics.find(
    (m) =>
      m.scope === scope &&
      m.kind === 'number' &&
      labelKey(m.name) === name &&
      m.bindings.some(
        (b) =>
          b.platformId === platformId &&
          (b.form === form || b.form === 'all') &&
          b.status === 'confirmed' &&
          ['core', 'secondary'].includes(b.level),
      ),
  );
}
export async function prepareAssociations(
  database: WorkspaceDatabase,
  platformId: string,
  incoming: CollectedPost[],
  judgment: Judgment,
  windowDays: number,
) {
  const known = database.db.select().from(posts).where(eq(posts.platformId, platformId)).all();
  const existingContents = database.db.select().from(contents).all();
  const allPosts = database.db.select().from(posts).all();
  const receipts = database.db.select().from(publishReceipts).all();
  const batches = database.db.select().from(publishRecords).all();
  const decisions = new Map<
    string,
    { postId: string; contentId: string; topicTitle?: string; form: '视频' | '图文' }
  >();
  const unresolved = [];
  for (const item of incoming) {
    const old = known.find(
      (p) =>
        p.id === item.key ||
        (normalizeTitle(p.title) === normalizeTitle(item.title) && p.publishedAt === item.publishedAt),
    );
    if (old) {
      decisions.set(item.key, { postId: old.id, contentId: old.contentId, form: item.form });
      continue;
    }
    const exact = receipts
      .filter((r) => r.platformId === platformId && normalizeTitle(r.title) === normalizeTitle(item.title))
      .map((r) => batches.find((b) => b.id === r.batchId)?.contentId)
      .filter((id): id is string => !!id);
    if (new Set(exact).size === 1) {
      decisions.set(item.key, { postId: item.key, contentId: exact[0], form: item.form });
      continue;
    }
    const candidates = existingContents
      .filter(
        (c) =>
          c.form === item.form &&
          allPosts.some(
            (p) =>
              p.contentId === c.id &&
              p.publishedAt &&
              Math.abs(Date.parse(p.publishedAt) - Date.parse(item.publishedAt)) <= windowDays * 86400000,
          ),
      )
      .map((c) => ({ id: c.id, title: c.title }));
    unresolved.push({ ...item, candidates });
  }
  if (unresolved.length) {
    const response = await judgment.read(
      z.object({
        matches: z.array(
          z.object({ key: z.string(), contentId: z.string().nullable(), topicTitle: z.string().min(1) }),
        ),
      }),
      `将作品关联到候选同内容，只有确信同一内容才选候选 id，否则 null。不得选候选之外的 id。每条都给一句简短选题，作为未匹配作品的历史偏好。无作品描述或标题无法判断主题时，只写“历史作品（无可用标题）”，不得虚构题材。返回每个 key 恰好一次。\n${JSON.stringify(unresolved)}`,
    );
    if (
      response.matches.length !== unresolved.length ||
      new Set(response.matches.map((x) => x.key)).size !== unresolved.length
    )
      throw new Error('作品关联结果缺失或重复');
    for (const match of response.matches) {
      const item = unresolved.find((p) => p.key === match.key);
      if (!item || (match.contentId && !item.candidates.some((c) => c.id === match.contentId)))
        throw new Error('AI 匹配了候选之外的作品');
      decisions.set(match.key, {
        postId: match.key,
        contentId: match.contentId ?? randomUUID(),
        topicTitle: match.contentId ? undefined : match.topicTitle,
        form: item.form,
      });
    }
  }
  return decisions;
}
export function persistCollection(
  database: WorkspaceDatabase,
  platformId: string,
  incoming: CollectedPost[],
  readings: CapturedReading[],
  decisions: Awaited<ReturnType<typeof prepareAssociations>>,
  config: WorkspaceConfig,
  options: {
    history: boolean;
    historyRange: [number, number];
    aliases: Record<string, string>;
    accountAliases: Record<string, string>;
    completed: Record<string, number[]>;
    now: Date;
  },
) {
  if (incoming.some((p) => !withinRecentWindow(p.publishedAt, options.now, config.parameters.recentWindow)))
    throw new Error('作品超出最近30天范围，禁止建档和建立历史选题');
  const now = options.now.toISOString();
  database.sqlite
    .transaction(() => {
      database.db
        .insert(accounts)
        .values({ platformId, loginState: 'logged_in', updatedAt: now })
        .onConflictDoNothing()
        .run();
      for (const item of incoming) {
        const match = decisions.get(item.key);
        if (!match) throw new Error('作品缺少关联结果');
        if (match.topicTitle) {
          const topicId = randomUUID();
          database.db
            .insert(topics)
            .values({
              id: topicId,
              title: match.topicTitle,
              direction: match.topicTitle,
              channelId: platformId,
              signal: item.title,
              sourceContext: '首次历史导入或后台手动发布作品',
              exploration: false,
              status: 'published',
              automatic: true,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          database.db
            .insert(contents)
            .values({
              id: match.contentId,
              topicId,
              form: item.form,
              title: item.title,
              videoCovers: {},
              updatedAt: now,
            })
            .run();
        }
        database.db
          .insert(posts)
          .values({
            id: match.postId,
            contentId: match.contentId,
            platformId,
            title: item.title,
            publishedAt: item.publishedAt,
            removed: false,
            updatedAt: now,
          })
          .onConflictDoUpdate({ target: posts.id, set: { removed: false, updatedAt: now } })
          .run();
      }
      for (const capture of readings) {
        if (capture.reading.status !== 'ok') throw new Error('失败的识别结果禁止入库');
        for (const reading of capture.reading.posts) {
          const key = capture.postKey ?? postKey(platformId, reading.title, reading.publishedAt);
          const item = incoming.find((p) => p.key === key);
          const match = decisions.get(key);
          if (!item || !match) throw new Error('识别出了列表以外的作品');
          const age = ageInDays(item.publishedAt, options.now);
          if (options.history && age > options.historyRange[1]) continue;
          for (const metric of reading.metrics) {
            const definition = metricFor(config, platformId, 'post', item.form, metric.label, options.aliases);
            if (!definition) continue;
            const value = parseDisplayedNumber(metric.raw);
            const historical = options.history ? historicalKind(age, options.historyRange) : 'none';
            database.db
              .insert(postSnapshots)
              .values({
                id: randomUUID(),
                postId: match.postId,
                capturedAt: capture.capturedAt,
                captureDate: shanghaiDate(new Date(capture.capturedAt)),
                dayAfterPublish: historical === 'historical' ? options.historyRange[0] : age,
                metricId: definition.id,
                value,
                backfillKind:
                  historical === 'historical'
                    ? 'historical'
                    : capture.kind === 'detail' && (options.completed[key] ?? []).some((d) => d < age)
                      ? 'checkpoint'
                      : 'none',
                updatedAt: now,
              })
              .onConflictDoNothing()
              .run();
          }
        }
        if (capture.reading.account.metrics.length) {
          const date = capture.reading.account.dataDate;
          if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('账号数据日期未知，不能用抓取日代替');
          for (const metric of capture.reading.account.metrics) {
            const definition = metricFor(config, platformId, 'account', 'all', metric.label, options.accountAliases);
            if (!definition) continue;
            const values = { value: parseDisplayedNumber(metric.raw), capturedAt: capture.capturedAt, updatedAt: now };
            database.db
              .insert(accountDaily)
              .values({ id: randomUUID(), platformId, dataDate: date, metricId: definition.id, ...values })
              .onConflictDoUpdate({
                target: [accountDaily.platformId, accountDaily.dataDate, accountDaily.metricId],
                set: values,
              })
              .run();
          }
        }
        const postId = capture.postKey ? decisions.get(capture.postKey)?.postId : null;
        for (const record of capture.reading.records) {
          database.db
            .insert(rawRecords)
            .values({
              id: randomUUID(),
              platformId,
              postId,
              dataDate: capture.reading.account.dataDate ?? shanghaiDate(new Date(capture.capturedAt)),
              type: record.type,
              content: { text: record.text },
              sourcePath: capture.sourcePath,
              capturedAt: capture.capturedAt,
              updatedAt: now,
            })
            .run();
        }
        if (postId)
          for (const signal of capture.reading.signals) {
            database.db
              .insert(topicSignals)
              .values({
                id: randomUUID(),
                sourceType: signal.type,
                text: signal.text,
                share: parseDisplayedNumber(signal.share),
                postId,
                sourceUrl: null,
                capturedAt: capture.capturedAt,
                updatedAt: now,
              })
              .run();
          }
      }
      for (const [key, completed] of Object.entries(options.completed)) {
        const prior = readState(database, `checkpoints:${key}`);
        writeState(database, `checkpoints:${key}`, {
          days: [...new Set([...(Array.isArray(prior?.days) ? prior.days : []), ...completed])],
          capturedAt: now,
        });
      }
      if (options.history) writeState(database, `${platformId}:history`, { completed: true, at: now });
    })
    .immediate();
}
