import type { PublishingTask } from './publishing-task-model';
import type { Content } from './content-model';
import { z } from 'zod';
import type { Asset } from './image-model';
import type { Platform } from './config';
import type { LayoutContent, LayoutPlatform } from './layout-model';
export const publishKindSchema = z.enum(['video', 'layout', 'xhs']);
export type PublishKind = z.infer<typeof publishKindSchema>;
const ratioSchema = z
  .string()
  .regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/)
  .refine((s) => s.split(':').every((n) => Number(n) > 0));
const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const publishingConfigSchema = z.object({
  videoMaxMB: z.number().positive(),
  videoTypes: z.array(z.string()).min(1),
  imageMaxMB: z.number().positive(),
  coverRatioTolerancePixels: z.number().nonnegative(),
  imageTypes: z.array(z.string()).min(1),
  xhsMaxImages: z.number().int().positive(),
  requiredVideoRatios: z.array(ratioSchema).min(1),
  templates: z
    .array(
      z.object({
        platformId: z.string().min(1),
        kinds: z.array(publishKindSchema).min(1),
        videoCoverRatio: ratioSchema.nullable(),
        extraVideoCoverRatios: z.array(ratioSchema).optional(),
        videoVerified: z.boolean().optional(),
        titleMax: z.number().int().positive().nullable(),
        descriptionMax: z.number().int().positive().nullable(),
        tagFormat: z.object({ prefix: z.string(), suffix: z.string(), separator: z.string() }).strict(),
        tags: z.array(z.string()),
        description: z.string(),
        defaultTime: clockSchema.nullable(),
        verified: z.boolean(),
      }),
    )
    .min(1),
});
export type PublishingConfig = z.infer<typeof publishingConfigSchema>;
export const commonCopySchema = z
  .object({
    title: z.string().max(1000),
    description: z.string().max(100000),
    tags: z.array(z.string().trim().min(1).max(100)).max(100),
  })
  .strict();
export type CommonCopy = z.infer<typeof commonCopySchema>;
export const publishSettingSchema = z
  .object({
    platformId: z.string().min(1),
    individuallyEdited: z.boolean(),
    title: z.string().max(1000),
    description: z.string().max(100000),
    tags: z.array(z.string().trim().min(1).max(100)).max(100),
    scheduleAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .nullable(),
  })
  .strict();
export const publishDraftSchema = z
  .object({
    kind: publishKindSchema,
    videoInput: z
      .object({
        topicId: z.string().nullable(),
        path: z.string().max(4000),
        covers: z.record(z.string(), z.string().min(1)),
      })
      .strict()
      .optional(),
    commonCopy: commonCopySchema,
    contentId: z.string().nullable(),
    videoId: z.string().nullable(),
    imageIds: z.array(z.string()).refine((ids) => new Set(ids).size === ids.length),
    snapshotIds: z.array(z.string()).refine((ids) => new Set(ids).size === ids.length),
    settings: z
      .array(publishSettingSchema)
      .refine((items) => new Set(items.map((p) => p.platformId)).size === items.length),
  })
  .strict()
  .refine(
    (d) =>
      d.kind === 'video'
        ? !d.imageIds.length && !d.snapshotIds.length
        : d.kind === 'layout'
          ? !d.videoId && !d.imageIds.length
          : !d.videoId && !d.snapshotIds.length,
    { message: '发布来源不可混用' },
  );
export type PublishDraft = z.infer<typeof publishDraftSchema>;
export type PublishSetting = z.infer<typeof publishSettingSchema>;
export type PublishBatch = {
  abandonedAt?: string | null;
  fixture?: boolean;
  id: string;
  revision: number;
  state: 'draft' | 'uploading' | 'prepared' | 'queued' | 'running' | 'finished';
  draft: PublishDraft;
  createdAt: string;
};
export type PublishReceipt = {
  id: string;
  batchId: string;
  platformId: string;
  status:
    'queued' | 'uploading' | 'ready' | 'expired' | 'submitting' | 'pending_review' | 'published' | 'failed' | 'unknown';
  screenshotAssetId: string | null;
  uploadedAt: string | null;
  materials: string | null;
  failureStage: 'upload' | 'publish' | null;
  title: string;
  platformPostId: string | null;
  url: string | null;
  publishedAt: string | null;
  reason: string | null;
  safeToRetry: boolean;
  revision: number;
};
export type PublishSnapshot = {
  id: string;
  layoutId: string;
  layoutUpdatedAt: string;
  contentId: string;
  platform: LayoutPlatform;
  content: LayoutContent;
  confirmedAt: string;
  state: 'ready' | 'queued' | 'published' | 'returned';
};
export type PublishVideo = {
  fingerprint?: { bytes: number; mtimeMs: number; sha256: string } | null;
  id: string;
  contentId: string;
  name: string;
  bytes: number;
  duration: number;
  width: number;
  height: number;
};
export type PublishingData = {
  uploadPlatforms?: string[];
  topics?: { id: string; title: string; fixture?: boolean }[];
  contents: Content[];
  videos: PublishVideo[];
  assets: Asset[];
  snapshots: PublishSnapshot[];
  batches: PublishBatch[];
  tasks?: PublishingTask[];
  receipts: PublishReceipt[];
  accounts: { platformId: string; ready: boolean; reason: string }[];
  recommendations: { platformId: string; month: string; time: string; basis: string }[];
  storageReady: boolean;
  aiReady: boolean;
  uploadReady: boolean;
  publishReady: boolean;
  handoffReady: boolean;
  message: string;
};
export const publishUpdateSchema = publishDraftSchema;
export const publishAiSchema = z
  .object({
    action: z.literal('ai'),
    draft: publishDraftSchema,
    instruction: z.string().trim().min(1).max(10000),
  })
  .strict();
export const publishActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('upload'),
      expectedRevision: z.number().int().nonnegative(),
      requestId: z.string().uuid(),
      platformIds: z
        .array(z.string().min(1))
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length),
      materials: z.string().min(1).max(2000000),
    })
    .strict(),
  z
    .object({
      action: z.literal('upload-and-publish'),
      expectedRevision: z.number().int().nonnegative(),
      requestId: z.string().uuid(),
      confirmed: z.literal(true),
      platformIds: z
        .array(z.string().min(1))
        .min(1)
        .refine((ids) => new Set(ids).size === ids.length),
      materials: z.string().min(1).max(2000000),
    })
    .strict(),
  z
    .object({
      action: z.literal('publish-all'),
      expectedRevision: z.number().int().nonnegative(),
      requestId: z.string().uuid(),
      confirmed: z.literal(true),
      materials: z.string().min(1).max(2000000),
      receipts: z
        .array(z.object({ id: z.string().min(1), expectedRevision: z.number().int().nonnegative() }).strict())
        .min(1)
        .refine((items) => new Set(items.map((r) => r.id)).size === items.length),
    })
    .strict(),
  z
    .object({
      action: z.literal('return'),
      snapshotId: z.string().min(1),
    })
    .strict(),
]);
export const publishRetrySchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    confirmed: z.literal(true),
    materials: z.string().min(1).max(2000000),
  })
  .strict();
export const publishMediaSchema = z.object({ kind: z.enum(['video', 'xhs']), contentId: z.string().min(1) }).strict();
export function newPublishDraft(kind: PublishKind): PublishDraft {
  return {
    kind,
    commonCopy: { title: '', description: '', tags: [] },
    contentId: null,
    videoId: null,
    imageIds: [],
    snapshotIds: [],
    settings: [],
  };
}
export function makePublishSetting(platformId: string, title: string, config: PublishingConfig): PublishSetting {
  const template = config.templates.find((t) => t.platformId === platformId);
  return {
    platformId,
    individuallyEdited: false,
    title,
    description: template?.description ?? '',
    tags: [...(template?.tags ?? [])],
    scheduleAt: null,
  };
}
// Compare pixel dimensions, allowing only configured integer-rounding error.
export function matchesCoverRatio(width: number, height: number, ratio: string, config: PublishingConfig) {
  const [w, h] = ratio.split(':').map(Number);
  return (
    [width, height, w, h].every((n) => Number.isFinite(n) && n > 0) &&
    Math.abs(width * h - height * w) / Math.max(w, h) <= config.coverRatioTolerancePixels
  );
}
export function autoVideoCovers(
  contentId: string | null,
  assets: Asset[],
  config: PublishingConfig,
  choices: Record<string, string> = {},
) {
  return config.requiredVideoRatios.map((ratio) => {
    const id = choices[ratio];
    const asset = id
      ? assets.find(
          (a) =>
            a.id === id &&
            a.contentId === contentId &&
            a.purposeId === 'video_cover' &&
            matchesCoverRatio(a.width, a.height, ratio, config),
        )
      : null;
    return {
      ratio,
      asset: asset ?? null,
      reason: asset ? '' : id ? '采用的封面已失效，请重新选择' : '尚未指定作品采用的封面',
    };
  });
}
// Explicit batch choices may reuse any existing image; never change its original association.
export function videoDraftCovers(draft: PublishDraft, data: PublishingData, config: PublishingConfig) {
  if (!draft.videoInput)
    return autoVideoCovers(
      draft.contentId,
      data.assets,
      config,
      data.contents.find((c) => c.id === draft.contentId)?.videoCovers,
    );
  return config.requiredVideoRatios.map((ratio) => {
    const id = draft.videoInput!.covers[ratio];
    const asset = data.assets.find((a) => a.id === id && matchesCoverRatio(a.width, a.height, ratio, config));
    return { ratio, asset: asset ?? null, reason: asset ? '' : id ? '封面已失效或比例不符' : '请选择封面' };
  });
}
export function parsePublishTags(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s#＃]+/u)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}
export function scheduleTime(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}:00+08:00`);
  if (!Number.isFinite(time)) return NaN;
  return new Date(time + 8 * 3600000).toISOString().slice(0, 16) === value ? time : NaN;
}
export function defaultPublishTime(
  platformId: string,
  data: PublishingData,
  config: PublishingConfig,
  now: number,
): string | null {
  const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
  const recommendation = data.recommendations.find((r) => r.platformId === platformId && r.month === day.slice(0, 7));
  const time = recommendation?.time ?? config.templates.find((t) => t.platformId === platformId)?.defaultTime;
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const today = `${day}T${time}`;
  return scheduleTime(today) > now ? today : `${new Date(now + 32 * 3600000).toISOString().slice(0, 10)}T${time}`;
}
export function canRetryReceipt(receipt: PublishReceipt) {
  return receipt.status === 'failed' && receipt.safeToRetry;
}
export function publishIssues(
  draft: PublishDraft,
  data: PublishingData,
  config: PublishingConfig,
  platforms: Platform[],
  now: number,
): string[] {
  const issues: string[] = [];
  if (!draft.contentId || !data.contents.some((c) => c.id === draft.contentId)) issues.push('请关联有效作品');
  const content = data.contents.find((c) => c.id === draft.contentId);
  if (content && content.form !== (draft.kind === 'video' ? '视频' : '图文'))
    issues.push('作品内容形式与发布来源不一致');
  if (!draft.settings.length) issues.push('请选择发布平台');
  if (draft.kind === 'video') {
    if (
      !draft.videoInput?.path.trim() &&
      !data.videos.some((v) => v.id === draft.videoId && v.contentId === draft.contentId)
    )
      issues.push(draft.videoInput ? '请填写视频地址' : '请选择这条作品的成片，文件会自动上传保存');
  }
  if (draft.kind === 'xhs') {
    if (!draft.imageIds.length) issues.push('请添加自己制作的图文图片');
    if (draft.imageIds.length > config.xhsMaxImages) issues.push(`图片最多 ${config.xhsMaxImages} 张`);
    if (draft.imageIds.some((id) => !data.assets.some((a) => a.id === id && a.source === 'upload')))
      issues.push('图片必须来自用户上传素材');
  }
  for (const setting of draft.settings)
    issues.push(...publishSettingIssues(draft, setting, data, config, platforms, now));
  if (
    draft.kind === 'layout' &&
    draft.snapshotIds.some(
      (id) =>
        !data.snapshots.some(
          (s) =>
            s.id === id && s.contentId === draft.contentId && draft.settings.some((p) => p.platformId === s.platform),
        ),
    )
  )
    issues.push('确认稿必须属于本作品及所选平台');
  return issues;
}
export function publishSettingIssues(
  draft: PublishDraft,
  setting: PublishSetting,
  data: PublishingData,
  config: PublishingConfig,
  platforms: Platform[],
  now: number,
): string[] {
  const issues: string[] = [];
  const platform = platforms.find((p) => p.id === setting.platformId);
  const template = config.templates.find((t) => t.platformId === setting.platformId);
  const name = platform?.name ?? setting.platformId;
  if (!platform?.active) issues.push(`${name}尚未启用`);
  if (!template?.kinds.includes(draft.kind)) {
    issues.push(`${name}不支持此来源`);
    return issues;
  }
  if (
    !(draft.kind === 'video' ? (template.videoVerified ?? template.verified) : template.verified) ||
    template.titleMax === null ||
    (draft.kind !== 'layout' && template.descriptionMax === null && !(draft.kind === 'video' && template.videoVerified))
  )
    issues.push(`${name}发布模板待核验`);
  if (!data.accounts.some((a) => a.platformId === setting.platformId && a.ready)) issues.push(`${name}账号尚未就绪`);
  if (
    draft.kind === 'video' &&
    !videoDraftCovers(draft, data, config).find((c) => c.ratio === template.videoCoverRatio)?.asset
  )
    issues.push(`${name}缺少 ${template.videoCoverRatio} 封面`);
  if (!setting.title.trim()) issues.push(`${name}缺少标题`);
  if (template.titleMax !== null && Array.from(setting.title).length > template.titleMax)
    issues.push(`${name}标题超过 ${template.titleMax} 字`);
  if (template.descriptionMax !== null && Array.from(setting.description).length > template.descriptionMax)
    issues.push(`${name}文案超过 ${template.descriptionMax} 字`);
  if (
    setting.scheduleAt !== null &&
    (!Number.isFinite(scheduleTime(setting.scheduleAt)) || scheduleTime(setting.scheduleAt) <= now)
  )
    issues.push(`${name}定时时间无效或已过期`);
  if (draft.kind === 'layout') {
    const snapshots = data.snapshots.filter(
      (s) =>
        draft.snapshotIds.includes(s.id) &&
        s.platform === setting.platformId &&
        s.contentId === draft.contentId &&
        s.state === 'ready',
    );
    if (snapshots.length !== 1) issues.push(`${name}须有唯一待发布确认稿`);
    else {
      const snapshot = snapshots[0];
      if (snapshot.content.title !== setting.title || setting.description !== '')
        issues.push(`${name}确认稿内容不可改写`);
      const ids = [
        ...snapshot.content.blocks.filter((b) => b.type === 'image').map((b) => b.assetId),
        ...Object.values(snapshot.content.covers),
      ];
      if (ids.some((id) => !data.assets.some((a) => a.id === id))) issues.push(`${name}确认稿配图缺失`);
    }
  }
  return issues;
}

export function publishMaterialKey(draft: PublishDraft, data: PublishingData, config: PublishingConfig): string {
  return JSON.stringify(
    draft.settings
      .map((s) => [s.platformId, platformMaterialKey(draft, s.platformId, data, config)])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
}

export function generatePublishSetting(
  platformId: string,
  draft: PublishDraft,
  data: PublishingData,
  config: PublishingConfig,
  now: number,
): PublishSetting {
  const snapshot = data.snapshots.find(
    (s) => s.contentId === draft.contentId && s.platform === platformId && s.state === 'ready',
  );
  const template = config.templates.find((t) => t.platformId === platformId);
  const copy = draft.commonCopy;
  return {
    platformId,
    individuallyEdited: false,
    title: draft.kind === 'layout' ? (snapshot?.content.title ?? '') : copy.title,
    description: draft.kind === 'layout' ? '' : copy.description,
    tags: [...new Set([...copy.tags, ...(template?.tags ?? [])])],
    scheduleAt: draft.videoInput ? null : defaultPublishTime(platformId, data, config, now),
  };
}
export function updateCommonCopy(
  draft: PublishDraft,
  copy: CommonCopy,
  data: PublishingData,
  config: PublishingConfig,
  now: number,
): PublishDraft {
  const next = { ...draft, commonCopy: copy };
  return {
    ...next,
    settings: draft.settings.map((s) =>
      s.individuallyEdited ? s : generatePublishSetting(s.platformId, next, data, config, now),
    ),
  };
}
export function restorePublishSetting(
  draft: PublishDraft,
  platformId: string,
  data: PublishingData,
  config: PublishingConfig,
  now: number,
): PublishDraft {
  return {
    ...draft,
    settings: draft.settings.map((s) =>
      s.platformId === platformId ? generatePublishSetting(platformId, draft, data, config, now) : s,
    ),
  };
}
export function formatPublishTags(tags: string[], platformId: string, config: PublishingConfig): string {
  const format = config.templates.find((t) => t.platformId === platformId)?.tagFormat;
  if (!format) return tags.join(' ');
  return tags.map((t) => `${format.prefix}${t.replace(/^#+|#+$/g, '')}${format.suffix}`).join(format.separator);
}
// A different platform's edit must not invalidate an already uploaded platform.
export function platformMaterialKey(
  draft: PublishDraft,
  platformId: string,
  data: PublishingData,
  config: PublishingConfig,
): string {
  const setting = draft.settings.find((s) => s.platformId === platformId);
  const template = config.templates.find((t) => t.platformId === platformId);
  const content = data.contents.find((c) => c.id === draft.contentId);
  const cover =
    draft.kind === 'video'
      ? videoDraftCovers(draft, data, config).find((c) => c.ratio === template?.videoCoverRatio)?.asset
      : null;
  const snapshots =
    draft.kind === 'layout'
      ? data.snapshots
          .filter((s) => draft.snapshotIds.includes(s.id) && s.platform === platformId)
          .sort((a, b) => a.id.localeCompare(b.id))
      : [];
  const ids = new Set([
    ...(draft.kind === 'xhs' ? draft.imageIds : []),
    ...(cover ? [cover.id] : []),
    ...(draft.kind === 'video'
      ? videoDraftCovers(draft, data, config)
          .filter((c) => template?.extraVideoCoverRatios?.includes(c.ratio))
          .flatMap((c) => (c.asset ? [c.asset.id] : []))
      : []),
    ...snapshots.flatMap((s) => [
      ...s.content.blocks.flatMap((b) => (b.assetId ? [b.assetId] : [])),
      ...Object.values(s.content.covers),
    ]),
  ]);
  return JSON.stringify({
    kind: draft.kind,
    ...(draft.videoInput ? { videoPath: draft.videoInput.path } : {}),
    contentId: draft.contentId,
    setting: setting
      ? { title: setting.title, description: setting.description, tags: setting.tags, scheduleAt: setting.scheduleAt }
      : null,
    video: draft.kind === 'video' ? data.videos.find((v) => v.id === draft.videoId) : null,
    imageIds: draft.kind === 'xhs' ? draft.imageIds : [],
    snapshots,
    coverId: cover?.id ?? null,
    assets: data.assets
      .filter((a) => ids.has(a.id))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((a) => ({
        id: a.id,
        version: a.version,
        width: a.width,
        height: a.height,
        purposeId: a.purposeId,
        contentId: a.contentId,
      })),
    template,
    account: data.accounts.find((a) => a.platformId === platformId),
  });
}
export function receiptExpired(receipt: PublishReceipt, now: number, expiryHours: number): boolean {
  const time = receipt.uploadedAt ? Date.parse(receipt.uploadedAt) : NaN;
  return !Number.isFinite(time) || time > now || now - time >= expiryHours * 3600000;
}
export function receiptStatus(
  receipt: PublishReceipt,
  draft: PublishDraft,
  data: PublishingData,
  config: PublishingConfig,
  now: number,
  expiryHours: number,
): PublishReceipt['status'] {
  if (
    receipt.status === 'ready' &&
    (receiptExpired(receipt, now, expiryHours) ||
      !receipt.screenshotAssetId ||
      receipt.materials !== platformMaterialKey(draft, receipt.platformId, data, config))
  )
    return 'expired';
  return receipt.status;
}
export function readyPublishReceipts(
  batchId: string,
  draft: PublishDraft,
  data: PublishingData,
  config: PublishingConfig,
  platforms: Platform[],
  now: number,
  expiryHours: number,
): PublishReceipt[] {
  return data.receipts.filter(
    (r) =>
      r.batchId === batchId &&
      draft.settings.some((s) => s.platformId === r.platformId) &&
      data.receipts.filter((other) => other.batchId === batchId && other.platformId === r.platformId).length === 1 &&
      receiptStatus(r, draft, data, config, now, expiryHours) === 'ready' &&
      !publishIssues(
        {
          ...draft,
          settings: draft.settings.filter((s) => s.platformId === r.platformId),
          snapshotIds: draft.snapshotIds.filter((id) =>
            data.snapshots.some((s) => s.id === id && s.platform === r.platformId),
          ),
        },
        data,
        config,
        platforms,
        now,
      ).length,
  );
}
export function uploadPlatformIds(
  batchId: string | null,
  draft: PublishDraft,
  data: PublishingData,
  config: PublishingConfig,
  now: number,
  expiryHours: number,
): string[] {
  return draft.settings
    .filter((s) => {
      const receipts = data.receipts.filter((r) => r.batchId === batchId && r.platformId === s.platformId);
      if (!receipts.length) return true;
      if (receipts.length !== 1) return false;
      const r = receipts[0];
      return (
        receiptStatus(r, draft, data, config, now, expiryHours) === 'expired' ||
        (canRetryReceipt(r) &&
          (r.failureStage === 'upload' ||
            receiptExpired(r, now, expiryHours) ||
            r.materials !== platformMaterialKey(draft, r.platformId, data, config) ||
            !r.screenshotAssetId))
      );
    })
    .map((s) => s.platformId);
}
export function canRetryPublishReceipt(
  receipt: PublishReceipt,
  draft: PublishDraft,
  data: PublishingData,
  config: PublishingConfig,
  now: number,
  expiryHours: number,
  platforms: Platform[],
): boolean {
  return (
    draft.settings.some((s) => s.platformId === receipt.platformId) &&
    !publishIssues(
      {
        ...draft,
        settings: draft.settings.filter((s) => s.platformId === receipt.platformId),
        snapshotIds: draft.snapshotIds.filter((id) =>
          data.snapshots.some((s) => s.id === id && s.platform === receipt.platformId),
        ),
      },
      data,
      config,
      platforms,
      now,
    ).length &&
    canRetryReceipt(receipt) &&
    receipt.failureStage === 'publish' &&
    !receiptExpired(receipt, now, expiryHours) &&
    !!receipt.screenshotAssetId &&
    receipt.materials === platformMaterialKey(draft, receipt.platformId, data, config)
  );
}

// Upload starts by checking the current account in the browser; stale login records do not block preparation.
export function videoUploadIssues(draft: PublishDraft, data: PublishingData, config: PublishingConfig): string[] {
  const issues: string[] = [];
  if (!draft.commonCopy.title.trim()) issues.push('请填写主题');
  if (!draft.videoInput?.path.trim()) issues.push('请填写视频地址');
  if (!draft.settings.length) issues.push('请选择发布平台');
  if (draft.settings.some((s) => !data.uploadPlatforms?.includes(s.platformId)))
    issues.push('所选平台中有尚未接通的视频上传平台');
  for (const cover of videoDraftCovers(draft, data, config))
    if (!cover.asset) issues.push(`请提供 ${cover.ratio} 封面`);
  return issues;
}
