import type { Content } from './content-model';
import { z } from 'zod';
export const imageConfigSchema = z.object({
  uploadMaxMB: z.number().positive(),
  acceptedTypes: z.array(z.enum(['image/png', 'image/jpeg'])).min(1),
  styles: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), prompt: z.string().min(1) })).min(1),
  purposes: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        description: z.string(),
        ratios: z.array(z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/)),
        reuseAnyRatio: z.boolean().default(false),
        contentMode: z.enum(['theme', 'paragraphs', 'free', 'upload']),
        references: z.array(z.string()),
      }),
    )
    .min(1),
});
export type ImageConfig = z.infer<typeof imageConfigSchema>;
export const imageDraftSchema = z
  .object({
    uploadPurposeId: z.string().default(''),
    title: z.string().trim().min(1).max(200),
    purposeId: z.string().min(1),
    styleId: z.string().min(1),
    prompt: z.string().max(20000),
    content: z.string().max(100000),
    ratio: z.string(),
    topicId: z.string().nullable(),
    contentId: z.string().nullable(),
    existingAssets: z.record(z.string(), z.string()),
    parentAssetId: z.string().nullable(),
    editInstruction: z.string().max(10000),
  })
  .strict();
export type ImageDraftInput = z.infer<typeof imageDraftSchema>;
export type ImageDraft = ImageDraftInput & { id: string; updatedAt: string; fixture?: boolean };
export type Asset = {
  id: string;
  familyId: string;
  updatedAt: string;
  title: string;
  purposeId: string;
  ratio: string;
  width: number;
  height: number;
  mime: string;
  topicId: string | null;
  contentId: string | null;
  source: 'upload' | 'ai';
  prompt: string;
  version: number;
  selected: boolean;
  createdAt: string;
};
export type ImageData = {
  tasks?: {
    id: string;
    input: ImageDraftInput;
    status: 'queued' | 'running' | 'success' | 'failed';
    assetIds: string[];
    reason: string | null;
    createdAt: string;
    updatedAt: string;
  }[];
  generations?: {
    id: string;
    kind: string;
    status: string;
    startedAt: string;
    durationMs: number | null;
    reason: string | null;
    calls: number;
  }[];
  assets: Asset[];
  drafts: ImageDraft[];
  topics: { id: string; title: string }[];
  contents: Content[];
  contentWriteReady: boolean;
  generationReady: boolean;
  storageReady: boolean;
  generationMessage: string;
};
export type OutputSlot = { key: string; label: string; ratio: string; text: string; allowAnyRatio?: boolean };
export function imageSlots(draft: ImageDraftInput, config: ImageConfig): OutputSlot[] {
  const purpose = config.purposes.find((item) => item.id === draft.purposeId);
  if (!purpose) return [];
  if (draft.parentAssetId)
    return [{ key: 'revision', label: '修改版', ratio: draft.ratio, text: draft.editInstruction }];
  if (purpose.contentMode === 'upload') return [];
  if (purpose.contentMode === 'paragraphs')
    return draft.content
      .split(/\n\s*\n/)
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, index) => ({
        key: `paragraph-${index}`,
        label: `第 ${index + 1} 段`,
        ratio: purpose.ratios[0],
        text,
        allowAnyRatio: purpose.reuseAnyRatio,
      }));
  const ratios = purpose.contentMode === 'free' ? [draft.ratio] : purpose.ratios;
  return ratios.map((ratio) => ({ key: ratio, label: ratio, ratio, text: draft.prompt }));
}

export function canReuseAsset(asset: Asset, slot: OutputSlot) {
  if (slot.allowAnyRatio) return true;
  const [w, h] = slot.ratio.split(':').map(Number);
  return w > 0 && h > 0 && Math.abs(asset.width * h - asset.height * w) < 0.01;
}

export const assetMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    purposeId: z.string().min(1),
    topicId: z.string().min(1).nullable(),
    contentId: z.string().min(1).nullable(),
  })
  .strict();

// Called inside the storage transaction: selection and work adoption succeed together.
export function selectAssetVersion(assets: Asset[], contents: Content[], id: string, config: ImageConfig, now: string) {
  const asset = assets.find((a) => a.id === id);
  if (!asset) throw new Error('素材不存在');
  const content = asset.contentId ? contents.find((c) => c.id === asset.contentId) : null;
  if (asset.contentId && !content) throw new Error('关联作品不存在');
  let adopted = content ?? null;
  if (content && asset.purposeId === 'video_cover') {
    const ratio = config.purposes
      .find((p) => p.id === asset.purposeId)
      ?.ratios.find((r) => canReuseAsset(asset, { key: r, label: r, ratio: r, text: '' }));
    if (content.form !== '视频' || !ratio || asset.width <= 0 || asset.height <= 0)
      throw new Error('作品或封面比例不符合要求');
    adopted = { ...content, videoCovers: { ...content.videoCovers, [ratio]: asset.id }, updatedAt: now };
  }
  const next = assets.map((a) => (a.familyId === asset.familyId ? { ...a, selected: a.id === id, updatedAt: now } : a));
  return { assets: next, asset: next.find((a) => a.id === id)!, content: adopted };
}
