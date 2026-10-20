import { integer, real, sqliteTable, text, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import type { TopicEvidence } from '../lib/topic-model';
import type { LayoutDocument } from '../lib/layout-model';
import type { ImageDraftInput } from '../lib/image-model';
import type { PublishDraft, PublishSnapshot, PublishReceipt } from '../lib/publishing-model';
import type { InboxMessage } from '../lib/inbox-model';
import type { Deal } from '../lib/deal-model';
const id = () => text('id').primaryKey();
const updatedAt = () => text('updated_at').notNull();
const revision = () => integer('revision').notNull().default(0);
const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();
const bool = (name: string) => integer(name, { mode: 'boolean' });

export const topics = sqliteTable('topics', {
  id: id(),
  fixture: bool('fixture').notNull().default(false),
  title: text('title').notNull(),
  direction: text('direction').notNull(),
  channelId: text('channel_id').notNull(),
  signal: text('signal').notNull(),
  sourceContext: text('source_context').notNull(),
  sourceUrl: text('source_url'),
  exploration: bool('exploration').notNull(),
  evidence: json<TopicEvidence>('evidence'),
  status: text('status', { enum: ['candidate', 'selected', 'skipped', 'published'] }).notNull(),
  frozenFire: bool('frozen_fire'),
  frozenEvidence: json<TopicEvidence>('frozen_evidence'),
  selectedAt: text('selected_at'),
  automatic: bool('automatic').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});
export const contents = sqliteTable('contents', {
  id: id(),
  mergedInto: text('merged_into'),
  fixture: bool('fixture').notNull().default(false),
  topicId: text('topic_id').references(() => topics.id),
  form: text('form', { enum: ['视频', '图文'] }).notNull(),
  title: text('title').notNull(),
  plannedDate: text('planned_date'),
  videoCovers: json<Record<string, string>>('video_covers').notNull(),
  updatedAt: updatedAt(),
});
export const accounts = sqliteTable('accounts', {
  platformId: text('platform_id').primaryKey(),
  platformAccountId: text('platform_account_id'),
  displayName: text('display_name'),
  loginState: text('login_state', { enum: ['logged_in', 'logged_out', 'unknown', 'awaiting_confirmation'] })
    .notNull()
    .default('unknown'),
  checkedAt: text('checked_at'),
  reason: text('reason'),
  statePath: text('state_path'),
  updatedAt: updatedAt(),
});
export const posts = sqliteTable(
  'posts',
  {
    id: id(),
    contentId: text('content_id')
      .notNull()
      .references(() => contents.id),
    platformId: text('platform_id').notNull(),
    platformPostId: text('platform_post_id'),
    publishedAt: text('published_at'),
    title: text('title').notNull(),
    url: text('url'),
    checkpointRatios: json<Record<string, number | null>>('checkpoint_ratios'),
    trend: text('trend'),
    hit: bool('hit'),
    firstPublication: bool('first_publication'),
    removed: bool('removed'),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('post_platform_identity').on(t.platformId, t.platformPostId)],
);
export const postSnapshots = sqliteTable(
  'post_snapshots',
  {
    id: id(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id),
    capturedAt: text('captured_at').notNull(),
    captureDate: text('capture_date').notNull(),
    dayAfterPublish: integer('day_after_publish'),
    metricId: text('metric_id').notNull(),
    value: real('value'),
    precision: text('precision', { enum: ['exact', 'display', 'unknown'] })
      .notNull()
      .default('unknown'),
    rawValue: text('raw_value'),
    backfillKind: text('backfill_kind', { enum: ['none', 'checkpoint', 'historical'] }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('snapshot_capture_metric').on(t.postId, t.capturedAt, t.metricId)],
);
export const accountDaily = sqliteTable(
  'account_daily',
  {
    id: id(),
    platformId: text('platform_id')
      .notNull()
      .references(() => accounts.platformId),
    dataDate: text('data_date').notNull(),
    backfilled: integer('backfilled', { mode: 'boolean' }).notNull().default(false),
    metricId: text('metric_id').notNull(),
    value: real('value'),
    precision: text('precision', { enum: ['exact', 'display', 'unknown'] })
      .notNull()
      .default('unknown'),
    rawValue: text('raw_value'),
    capturedAt: text('captured_at').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('account_day_metric').on(t.platformId, t.dataDate, t.metricId)],
);
export const crawlLogs = sqliteTable(
  'crawl_logs',
  {
    id: id(),
    platformId: text('platform_id').notNull(),
    startedAt: text('started_at').notNull(),
    finishedAt: text('finished_at'),
    status: text('status', { enum: ['running', 'success', 'failed'] }).notNull(),
    reason: text('reason'),
    archivePaths: json<string[]>('archive_paths').notNull(),
    telemetry: json<{
      delayed: boolean;
      reusedScreenshots: boolean;
      pages: number;
      aiCalls: number;
      aiReads?: number; // Older telemetry did not separate image reads from text judgments.
      attention: boolean;
    }>('telemetry'),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'crawl_completion',
      sql`(${t.status} = 'running' AND ${t.finishedAt} IS NULL) OR (${t.status} = 'success' AND ${t.finishedAt} IS NOT NULL AND ${t.reason} IS NULL) OR (${t.status} = 'failed' AND ${t.finishedAt} IS NOT NULL AND length(trim(${t.reason})) > 0)`,
    ),
  ],
);
export const assets = sqliteTable(
  'assets',
  {
    id: id(),
    fixture: bool('fixture').notNull().default(false),
    familyId: text('family_id').notNull(),
    contentId: text('content_id').references(() => contents.id),
    topicId: text('topic_id').references(() => topics.id),
    title: text('title').notNull(),
    purposeId: text('purpose_id').notNull(),
    ratio: text('ratio').notNull(),
    path: text('path').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    mime: text('mime').notNull(),
    source: text('source', { enum: ['ai', 'upload'] }).notNull(),
    prompt: text('prompt').notNull(),
    version: integer('version').notNull(),
    selected: bool('selected').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('asset_family_version').on(t.familyId, t.version)],
);
export const imageDrafts = sqliteTable('image_drafts', {
  id: id(),
  fixture: bool('fixture').notNull().default(false),
  input: json<ImageDraftInput>('input').notNull(),
  updatedAt: updatedAt(),
});
export const layouts = sqliteTable('layouts', {
  id: id(),
  fixture: bool('fixture').notNull().default(false),
  contentId: text('content_id').references(() => contents.id),
  source: text('source').notNull(),
  variants: json<LayoutDocument['variants']>('variants').notNull(),
  updatedAt: updatedAt(),
});
export const topicSignals = sqliteTable('topic_signals', {
  id: id(),
  sourceType: text('source_type').notNull(),
  text: text('text').notNull(),
  share: real('share'),
  postId: text('post_id').references(() => posts.id),
  sourceUrl: text('source_url'),
  sourceMessageId: text('source_message_id').unique(),
  sourceThemeId: text('source_theme_id').unique(),
  capturedAt: text('captured_at').notNull(),
  updatedAt: updatedAt(),
});
export const messages = sqliteTable('messages', {
  id: id(),
  revision: revision(),
  platformId: text('platform_id').notNull(),
  channel: text('channel', { enum: ['comment', 'dm'] }).notNull(),
  postId: text('post_id').references(() => posts.id),
  contentId: text('content_id').references(() => contents.id),
  contentTitle: text('content_title'),
  author: text('author').notNull(),
  body: text('body').notNull(),
  sentAt: text('sent_at'),
  capturedAt: text('captured_at'),
  sourceUrl: text('source_url'),
  classification: json<InboxMessage['classification']>('classification').notNull(),
  reply: json<InboxMessage['reply']>('reply').notNull(),
  context: json<InboxMessage['context']>('context').notNull(),
  contextComplete: bool('context_complete').notNull(),
  dealId: text('deal_id'),
  dealSync: text('deal_sync', { enum: ['pending', 'synced', 'failed'] }).notNull(),
  dealSyncReason: text('deal_sync_reason'),
  topicSignalId: text('topic_signal_id').references(() => topicSignals.id),
  topicSyncedAt: text('topic_synced_at'),
  updatedAt: updatedAt(),
});
export const deals = sqliteTable('deals', {
  id: id(),
  revision: revision(),
  brand: text('brand'),
  requirement: text('requirement'),
  status: text('status', { enum: ['pending', 'following', 'completed'] }).notNull(),
  platformId: text('platform_id').notNull(),
  channel: text('channel', { enum: ['comment', 'dm'] }).notNull(),
  messageId: text('message_id')
    .notNull()
    .unique()
    .references(() => messages.id),
  suggestion: json<Deal['suggestion']>('suggestion'),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});
export const demandThemes = sqliteTable('demand_themes', {
  id: id(),
  revision: revision(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  messageIds: json<string[]>('message_ids').notNull(),
  signalId: text('signal_id').references(() => topicSignals.id),
  updatedAt: updatedAt(),
});
export const topicGenerationTasks = sqliteTable('topic_generation_tasks', {
  id: id(),
  revision: revision(),
  status: text('status', { enum: ['queued', 'running', 'completed', 'failed'] }).notNull(),
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});
export const topicGenerationResults = sqliteTable('topic_generation_results', {
  id: id(),
  taskId: text('task_id')
    .notNull()
    .references(() => topicGenerationTasks.id),
  topicId: text('topic_id').references(() => topics.id),
  revision: revision(),
  generatedFields: json<Record<string, unknown>>('generated_fields').notNull(),
  updatedAt: updatedAt(),
});
export const publishRecords = sqliteTable('publish_records', {
  id: id(),
  fixture: bool('fixture').notNull().default(false),
  revision: revision(),
  contentId: text('content_id')
    .notNull()
    .references(() => contents.id),
  state: text('state', { enum: ['draft', 'uploading', 'prepared', 'queued', 'running', 'finished'] }).notNull(),
  draft: json<PublishDraft>('draft').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});
export const publishReceipts = sqliteTable(
  'publish_receipts',
  {
    id: id(),
    revision: revision(),
    batchId: text('batch_id')
      .notNull()
      .references(() => publishRecords.id),
    platformId: text('platform_id').notNull(),
    status: text('status').$type<PublishReceipt['status']>().notNull(),
    screenshotAssetId: text('screenshot_asset_id').references(() => assets.id),
    uploadedAt: text('uploaded_at'),
    materials: text('materials'),
    failureStage: text('failure_stage', { enum: ['upload', 'publish'] }),
    title: text('title').notNull(),
    platformPostId: text('platform_post_id'),
    url: text('url'),
    publishedAt: text('published_at'),
    reason: text('reason'),
    safeToRetry: bool('safe_to_retry').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('receipt_record_platform').on(t.batchId, t.platformId)],
);
export const publishSnapshots = sqliteTable('publish_snapshots', {
  id: id(),
  layoutId: text('layout_id')
    .notNull()
    .references(() => layouts.id),
  layoutUpdatedAt: text('layout_updated_at').notNull(),
  contentId: text('content_id')
    .notNull()
    .references(() => contents.id),
  platform: text('platform').notNull(),
  content: json<PublishSnapshot['content']>('content').notNull(),
  confirmedAt: text('confirmed_at').notNull(),
  state: text('state', { enum: ['ready', 'queued', 'published', 'returned'] }).notNull(),
  updatedAt: updatedAt(),
});
export const publishVideos = sqliteTable('publish_videos', {
  id: id(),
  contentId: text('content_id')
    .notNull()
    .references(() => contents.id),
  name: text('name').notNull(),
  path: text('path').notNull(),
  bytes: integer('bytes').notNull(),
  duration: real('duration').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  updatedAt: updatedAt(),
});
export const publishAttempts = sqliteTable('publish_attempts', {
  id: id(),
  receiptId: text('receipt_id')
    .notNull()
    .references(() => publishReceipts.id),
  requestId: text('request_id').notNull(),
  receipt: json<PublishReceipt>('receipt').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});
export const publishRequests = sqliteTable('publish_requests', {
  id: id(),
  batchId: text('batch_id')
    .notNull()
    .references(() => publishRecords.id),
  action: text('action', { enum: ['upload', 'publish-all', 'retry'] }).notNull(),
  input: json<Record<string, unknown>>('input').notNull(),
  result: json<Record<string, unknown>>('result'),
  status: text('status', { enum: ['queued', 'running', 'completed', 'failed', 'unknown'] }).notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});

export const rawRecords = sqliteTable(
  'raw_records',
  {
    id: id(),
    platformId: text('platform_id').notNull(),
    postId: text('post_id').references(() => posts.id),
    dataDate: text('data_date').notNull(),
    type: text('type').notNull(),
    content: json<Record<string, unknown>>('content').notNull(),
    sourcePath: text('source_path').notNull(),
    capturedAt: text('captured_at').notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('raw_record_json', sql`json_valid(${t.content})`),
    check('raw_record_source', sql`${t.sourcePath} LIKE 'data/%' AND instr(${t.sourcePath}, '..') = 0`),
  ],
);

export const attentionItems = sqliteTable('attention_items', {
  id: id(),
  platformId: text('platform_id').notNull(),
  kind: text('kind', { enum: ['login', 'confirmation', 'risk', 'capacity'] }).notNull(),
  reason: text('reason').notNull(),
  status: text('status', { enum: ['pending', 'resolved', 'failed'] }).notNull(),
  deadline: text('deadline'),
  spaceId: integer('space_id'),
  page: text('page'),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});

export const collectionState = sqliteTable('collection_state', {
  key: text('key').primaryKey(),
  value: json<Record<string, unknown>>('value').notNull(),
  updatedAt: updatedAt(),
});

export const imageGenerations = sqliteTable('image_generations', {
  id: id(),
  fixture: bool('fixture').notNull().default(false),
  kind: text('kind', { enum: ['generate', 'edit'] }).notNull(),
  usageDate: text('usage_date').notNull(),
  status: text('status', { enum: ['running', 'success', 'failed'] }).notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  durationMs: integer('duration_ms'),
  calls: integer('calls').notNull(),
  reason: text('reason'),
  threadId: text('thread_id'),
  sourcePath: text('source_path'),
  assetId: text('asset_id').references(() => assets.id),
});

export const imageTasks = sqliteTable('image_tasks', {
  id: id(),
  fixture: bool('fixture').notNull().default(false),
  input: json<ImageDraftInput>('input').notNull(),
  status: text('status', { enum: ['queued', 'running', 'success', 'failed'] }).notNull(),
  pid: integer('pid'),
  assetIds: json<string[]>('asset_ids').notNull(),
  reason: text('reason'),
  createdAt: text('created_at').notNull(),
  updatedAt: updatedAt(),
});

export const reviewCheckpoints = sqliteTable(
  'review_checkpoints',
  {
    id: id(),
    postId: text('post_id')
      .notNull()
      .references(() => posts.id),
    day: integer('day').notNull(),
    metricId: text('metric_id').notNull(),
    result: json<import('../core/review').FrozenPoint>('result').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('review_post_day_metric').on(t.postId, t.day, t.metricId)],
);

// Only generated interpretations are persisted; comparison statistics remain computed on read.
export const dataInterpretations = sqliteTable('data_interpretations', {
  id: id(),
  postId: text('post_id')
    .notNull()
    .references(() => posts.id),
  day: integer('day').notNull(),
  fingerprint: text('fingerprint').notNull().unique(),
  numbers: json<import('../lib/data-center-model').InterpretationInput>('numbers').notNull(),
  paragraphs: json<string[]>('paragraphs').notNull(),
  createdAt: text('created_at').notNull(),
});
