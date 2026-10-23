import { mediaStage } from './publishing-media-stage.ts';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import {
  assets,
  contents,
  topics,
  publishRecords,
  publishSnapshots,
  publishVideos,
  publishReceipts,
} from '../db/schema.ts';
import {
  publishDraftSchema,
  commonCopySchema,
  updateCommonCopy,
  type PublishingData,
  type PublishDraft,
} from './publishing-model.ts';
import { layoutPlatformSchema } from './layout-model.ts';
import { contentCoverSchema } from './content-model.ts';
import { loadConfig } from './config.ts';
import { loadPublishingConfig } from './publishing-config.ts';
import { CodexJudgment, type Judgment } from '../ai/structured.ts';
import { actOnLayout } from './layout-store.ts';
export function publishingData(db: WorkspaceDatabase): PublishingData {
  return {
    topics: db.db
      .select({ id: topics.id, title: topics.title, fixture: topics.fixture })
      .from(topics)
      .where(eq(topics.status, 'selected'))
      .all(),
    contents: db.db.select().from(contents).all(),
    assets: db.db.select().from(assets).all(),
    videos: db.db.select().from(publishVideos).all(),
    snapshots: db.db
      .select()
      .from(publishSnapshots)
      .all()
      .map((s) => ({ ...s, platform: layoutPlatformSchema.parse(s.platform) })),
    batches: db.db.select().from(publishRecords).all(),
    receipts: db.db.select().from(publishReceipts).all(),
    accounts: [],
    recommendations: [],
    storageReady: true,
    aiReady: true,
    handoffReady: true,
    uploadReady: false,
    publishReady: false,
    message:
      '审查 E 已通过。当前等待可真实发布的新作品，平台上传尚未完成实测；材料可继续准备，每个平台首次真实发布前仍须审查 F 确认。',
  };
}
export async function savePublishing(db: WorkspaceDatabase, raw: unknown, id?: string, expectedRevision?: number) {
  const input = publishDraftSchema.parse(raw),
    config = await loadPublishingConfig((await loadConfig()).platforms);
  return db.db.transaction((tx) => {
    const old = id ? tx.select().from(publishRecords).where(eq(publishRecords.id, id)).get() : null;
    if (id && !old) throw new Error('发布草稿不存在。');
    if (old && old.revision !== expectedRevision) throw new Error('发布草稿已被其他窗口修改，请刷新后再保存。');
    if (input.videoInput && input.kind !== 'video') throw Error('视频输入不能用于图文');
    if (input.videoInput) {
      if (!input.commonCopy.title.trim() || input.commonCopy.title.trim().length > 200)
        throw Error('请填写不超过200字的主题');
      if (input.videoInput.topicId && !tx.select().from(topics).where(eq(topics.id, input.videoInput.topicId)).get())
        throw Error('选题已不存在，请重新选择或手动填写主题');
      if (!input.contentId && old) input.contentId = old.draft.contentId;
      if (!input.contentId) {
        input.contentId = randomUUID();
        tx.insert(contents)
          .values({
            id: input.contentId,
            title: input.commonCopy.title.trim(),
            topicId: input.videoInput.topicId,
            form: '视频',
            plannedDate: null,
            videoCovers: {},
            updatedAt: new Date().toISOString(),
          })
          .run();
      }
    }
    const content = input.contentId ? tx.select().from(contents).where(eq(contents.id, input.contentId)).get() : null;
    if (!content || content.form !== (input.kind === 'video' ? '视频' : '图文'))
      throw new Error('请选择与发布来源一致的作品。');
    if (
      input.settings.some(
        (s) => !config.templates.some((t) => t.platformId === s.platformId && t.kinds.includes(input.kind)),
      )
    )
      throw new Error('发布平台与内容来源不符。');
    if (
      input.videoId &&
      !tx
        .select()
        .from(publishVideos)
        .all()
        .some((v) => v.id === input.videoId && v.contentId === input.contentId)
    )
      throw new Error('成片不属于这条作品。');
    const allAssets = tx.select().from(assets).all();
    if (
      input.imageIds.some(
        (id) => !allAssets.some((a) => a.id === id && a.contentId === input.contentId && a.source === 'upload'),
      )
    )
      throw new Error('图文图片必须是这条作品上传的素材。');
    if (input.imageIds.length > config.xhsMaxImages) throw new Error('图文图片数量超过配置上限。');
    if (input.videoInput) {
      for (const [ratio, assetId] of Object.entries(input.videoInput.covers)) {
        const [w, h] = ratio.split(':').map(Number);
        const asset = allAssets.find((a) => a.id === assetId);
        if (
          !config.requiredVideoRatios.includes(ratio) ||
          !asset ||
          asset.width <= 0 ||
          asset.height <= 0 ||
          Math.abs(asset.width * h - asset.height * w) > 0.01
        )
          throw Error('封面不存在或比例不符，请重新选择');
      }
    }
    const snapshots = tx.select().from(publishSnapshots).all();
    for (const snapshotId of input.snapshotIds) {
      const snapshot = snapshots.find(
        (s) => s.id === snapshotId && s.contentId === input.contentId && s.state === 'ready',
      );
      const setting = input.settings.find((s) => s.platformId === snapshot?.platform);
      if (!snapshot || !setting || setting.title !== snapshot.content.title || setting.description !== '')
        throw new Error('确认稿已退回、来源不符或内容被改写，请刷新后重新选择。');
    }
    if (old?.abandonedAt) throw Error('这次发布准备已放弃，请新建准备；原回执保留');
    if (
      old &&
      mediaStage(old, tx.select().from(publishReceipts).all()) !== 'editable' &&
      (old.draft.videoId !== input.videoId ||
        JSON.stringify(old.draft.imageIds) !== JSON.stringify(input.imageIds) ||
        JSON.stringify(old.draft.videoInput) !== JSON.stringify(input.videoInput))
    )
      throw Error('已上传或结果未确认，不能替换素材；请先核实或放弃上传');
    if (old && old.state !== 'draft') throw new Error('当前批次已进入执行阶段，不能覆盖草稿。');
    const now = new Date().toISOString(),
      record = {
        id: id ?? randomUUID(),
        revision: (old?.revision ?? -1) + 1,
        contentId: content.id,
        state: 'draft' as const,
        draft: input,
        createdAt: old?.createdAt ?? now,
        updatedAt: now,
      };
    tx.insert(publishRecords)
      .values(record)
      .onConflictDoUpdate({
        target: publishRecords.id,
        set: { draft: input, contentId: content.id, revision: record.revision, updatedAt: now },
      })
      .run();
    return record;
  });
}
export async function publishingAI(
  db: WorkspaceDatabase,
  draft: PublishDraft,
  instruction: string,
  judgment: Judgment = new CodexJudgment(),
) {
  if (draft.kind === 'layout') throw new Error('排版确认稿不可在发布中心改写，请退回排版中心修改。');
  const content = db.db
    .select()
    .from(contents)
    .all()
    .find((c) => c.id === draft.contentId);
  if (!content) throw new Error('请先关联作品。');
  const copy = await judgment.read(
    commonCopySchema,
    `为用户的发布准备起草通用文案，不发布，不添加未经提供的事实。作品：${content.title}。要求：${instruction}。当前文案：${JSON.stringify(draft.commonCopy)}`,
  );
  return updateCommonCopy(
    draft,
    copy,
    publishingData(db),
    await loadPublishingConfig((await loadConfig()).platforms),
    Date.now(),
  );
}
export async function returnSnapshot(db: WorkspaceDatabase, batchId: string, snapshotId: string) {
  const batch = db.db.select().from(publishRecords).where(eq(publishRecords.id, batchId)).get();
  const snapshot = db.db.select().from(publishSnapshots).where(eq(publishSnapshots.id, snapshotId)).get();
  if (
    !batch ||
    batch.abandonedAt ||
    batch.state !== 'draft' ||
    !snapshot ||
    snapshot.contentId !== batch.contentId ||
    !batch.draft.snapshotIds.includes(snapshotId) ||
    snapshot.state !== 'ready'
  )
    throw new Error('此确认稿无法从当前批次退回。');
  await actOnLayout(db, snapshot.layoutId, { platform: snapshot.platform, action: 'revise' });
  return db.db.transaction((tx) => {
    const current = tx.select().from(publishRecords).where(eq(publishRecords.id, batchId)).get()!;
    const result = {
      ...current,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
      draft: {
        ...current.draft,
        snapshotIds: current.draft.snapshotIds.filter((id) => id !== snapshotId),
        settings: current.draft.settings.filter((s) => s.platformId !== snapshot.platform),
      },
    };
    tx.update(publishRecords)
      .set({ draft: result.draft, revision: result.revision, updatedAt: result.updatedAt })
      .where(eq(publishRecords.id, batchId))
      .run();
    return result;
  });
}
export async function adoptCover(db: WorkspaceDatabase, id: string, raw: unknown) {
  const input = contentCoverSchema.parse(raw),
    config = await loadPublishingConfig((await loadConfig()).platforms);
  if (!config.requiredVideoRatios.includes(input.ratio)) throw new Error('不支持的封面比例。');
  return db.db.transaction((tx) => {
    const content = tx.select().from(contents).where(eq(contents.id, id)).get();
    if (!content || content.form !== '视频') throw new Error('请选择视频作品。');
    if (input.assetId) {
      const asset = tx.select().from(assets).where(eq(assets.id, input.assetId)).get();
      const [w, h] = input.ratio.split(':').map(Number);
      if (
        !asset ||
        asset.contentId !== id ||
        asset.purposeId !== 'video_cover' ||
        Math.abs(asset.width * h - asset.height * w) > 0.01
      )
        throw new Error('封面用途、作品或比例不符。');
    }
    const videoCovers = { ...content.videoCovers };
    if (input.assetId) videoCovers[input.ratio] = input.assetId;
    else delete videoCovers[input.ratio];
    const result = { ...content, videoCovers, updatedAt: new Date().toISOString() };
    tx.update(contents).set(result).where(eq(contents.id, id)).run();
    return result;
  });
}

export function abandonPublishing(db: WorkspaceDatabase, id: string, expectedRevision: number) {
  return db.db.transaction((tx) => {
    const batch = tx.select().from(publishRecords).where(eq(publishRecords.id, id)).get();
    if (!batch || batch.revision !== expectedRevision) throw Error('发布记录已改变，请刷新核对');
    const stage = mediaStage(batch, tx.select().from(publishReceipts).all());
    if (stage !== 'uploaded') throw Error('只有明确已上传且未发布的批次可放弃；进行中、结果未知和已发布记录必须先核实');
    tx.update(publishRecords)
      .set({ abandonedAt: new Date().toISOString(), revision: batch.revision + 1 })
      .where(eq(publishRecords.id, id))
      .run();
    return tx.select().from(publishRecords).where(eq(publishRecords.id, id)).get()!;
  });
}
