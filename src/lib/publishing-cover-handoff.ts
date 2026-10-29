import {
  matchesCoverRatio,
  newPublishDraft,
  videoDraftCovers,
  type PublishBatch,
  type PublishKind,
  type PublishingConfig,
  type PublishingData,
} from './publishing-model';
import { mediaStage } from './publishing-media-stage';
import type { Asset } from './image-model';

function available(record: unknown) {
  const value = record as { archivedAt?: string | null; mergedInto?: string | null } | undefined;
  return !!value && !value.archivedAt && !value.mergedInto;
}

export function initialPublishingBatch(
  data: PublishingData,
  input: { batchId: string | null; assetId: string | null; contentId: string | null; kind: PublishKind },
) {
  if (input.batchId) return data.batches.find((batch) => batch.id === input.batchId) ?? null;
  if (input.assetId || input.contentId || input.kind !== 'video') return null;
  return (
    data.batches
      .filter(
        (batch) =>
          batch.draft.kind === 'video' && batch.draft.videoInput && !batch.abandonedAt && batch.state !== 'finished',
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}

export function handoffAsset(
  data: PublishingData,
  config: PublishingConfig,
  assetId: string,
): { asset: Asset | null; ratios: string[]; error: string } {
  const asset = data.assets.find((item) => item.id === assetId);
  if (!available(asset)) return { asset: null, ratios: [], error: '这张封面已归档或不存在，请重新选择。' };
  const ratios = config.requiredVideoRatios.filter((ratio) =>
    matchesCoverRatio(asset!.width, asset!.height, ratio, config),
  );
  return {
    asset: asset!,
    ratios,
    error: ratios.length ? '' : '这张图片的比例不适合作为发布封面，请回到封面生成制作所需比例。',
  };
}

export function editableCoverBatch(batch: PublishBatch, data: PublishingData) {
  return (
    available(batch) &&
    !batch.abandonedAt &&
    batch.draft.kind === 'video' &&
    batch.state === 'draft' &&
    available(data.contents.find((content) => content.id === batch.draft.contentId)) &&
    !data.tasks?.some((task) => task.batchId === batch.id) &&
    mediaStage(batch, data.receipts) === 'editable'
  );
}

export function handoffTopic(data: PublishingData, topicId: string | null) {
  const topic = data.topics?.find((item) => item.id === topicId);
  return available(topic) ? topic! : null;
}

export function prepareCoverHandoff(
  data: PublishingData,
  config: PublishingConfig,
  input: {
    assetId: string;
    batchId: string | null;
    ratio: string;
    title: string;
    topicId: string | null;
    replaceConfirmed: boolean;
  },
) {
  const asset = handoffAsset(data, config, input.assetId);
  if (asset.error) throw Error(asset.error);
  if (!asset.ratios.includes(input.ratio)) throw Error('请选择与原图匹配的封面比例。');
  const batch = input.batchId ? data.batches.find((item) => item.id === input.batchId) : null;
  if (input.batchId && (!batch || !editableCoverBatch(batch, data)))
    throw Error('这条发布任务已不可编辑，请选择另一条草稿或新建视频发布。');
  if (input.topicId && !handoffTopic(data, input.topicId)) throw Error('来源选题已不可用，请明确取消关联后继续。');
  const draft = batch ? structuredClone(batch.draft) : newPublishDraft('video');
  if (!batch) {
    if (!input.title.trim() || input.title.trim().length > 200) throw Error('请填写不超过 200 字的主题。');
    draft.commonCopy.title = input.title.trim();
    draft.videoInput = { topicId: input.topicId, path: '', covers: {} };
  }
  const content = data.contents.find((item) => item.id === draft.contentId);
  const existing = draft.videoInput ?? {
    topicId: content?.topicId ?? null,
    path: '',
    covers: Object.fromEntries(
      videoDraftCovers(draft, data, config).flatMap((cover) => (cover.asset ? [[cover.ratio, cover.asset.id]] : [])),
    ),
  };
  const previous = existing.covers[input.ratio];
  if (previous && previous !== input.assetId && !input.replaceConfirmed)
    throw Error('这个比例已有封面，请确认替换后再保存。');
  draft.videoInput = { ...existing, covers: { ...existing.covers, [input.ratio]: input.assetId } };
  return { batch: batch ?? null, draft };
}
