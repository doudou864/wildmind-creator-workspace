import { z } from 'zod';
import type { Content } from './content-model';
import type { Asset } from './image-model';
export const layoutPlatformSchema = z.enum(['wechat', 'douyin', 'x']);
export type LayoutPlatform = z.infer<typeof layoutPlatformSchema>;
const ratioSchema = z
  .string()
  .regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/)
  .refine((value) => value.split(':').every((n) => Number(n) > 0));
export const layoutConfigSchema = z.object({
  style: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    bodySize: z.number().min(12).max(24),
    lineHeight: z.number().min(1).max(3),
    paragraphGap: z.number().min(0).max(48),
    headingSize: z.number().min(16).max(32),
  }),
  platforms: z
    .array(z.object({ id: layoutPlatformSchema, name: z.string(), code: z.string(), preview: z.string() }))
    .length(3)
    .refine((items) => new Set(items.map((item) => item.id)).size === 3),
  wechatCoverRatios: z.tuple([ratioSchema, ratioSchema]),
  douyinImageRatio: ratioSchema,
  douyinMaxImages: z.number().int().min(1).max(100),
});
export type LayoutConfig = z.infer<typeof layoutConfigSchema>;
export const layoutBlockSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum(['paragraph', 'heading', 'quote', 'list', 'image']),
    text: z.string().max(100000),
    assetId: z.string().nullable(),
  })
  .strict();
export type LayoutBlock = z.infer<typeof layoutBlockSchema>;
export const layoutContentSchema = z
  .object({
    title: z.string().max(200),
    blocks: z
      .array(layoutBlockSchema)
      .max(1000)
      .refine((blocks) => new Set(blocks.map((b) => b.id)).size === blocks.length),
    covers: z.record(z.string(), z.string()),
  })
  .strict();
export type LayoutContent = z.infer<typeof layoutContentSchema>;
export type LayoutVariant = LayoutContent & {
  status: 'draft' | 'confirmed' | 'sent';
  revision: number;
  confirmedRevision: number | null;
};
export type LayoutDocument = {
  id: string | null;
  revision: number;
  contentId: string | null;
  source: string;
  variants: Record<LayoutPlatform, LayoutVariant>;
};
export type LayoutData = {
  documents: LayoutDocument[];
  contents: Content[];
  assets: Asset[];
  storageReady: boolean;
  aiReady: boolean;
  handoffReady: boolean;
  message: string;
};
export const layoutSaveSchema = z
  .object({
    contentId: z.string().min(1).nullable(),
    source: z.string().max(100000),
    variants: z.object({ wechat: layoutContentSchema, douyin: layoutContentSchema, x: layoutContentSchema }).strict(),
  })
  .strict();
export const layoutUpdateSchema = layoutSaveSchema.extend({ expectedRevision: z.number().int().nonnegative() });
export const layoutActionSchema = z
  .object({
    platform: layoutPlatformSchema,
    action: z.enum(['confirm', 'send', 'revise', 'ai']),
    expectedRevision: z.number().int().nonnegative(),
    instruction: z.string().trim().max(10000).optional(),
  })
  .strict()
  .refine((v) => v.action !== 'ai' || !!v.instruction, { message: '请填写修改要求' });
export type LayoutAction = z.infer<typeof layoutActionSchema>['action'];
export function parseArticle(source: string): { title: string; blocks: LayoutBlock[] } {
  const lines = source.replace(/\r\n?/g, '\n').trim().split('\n');
  const title = (lines.shift() ?? '').replace(/^#{1,6}\s+/, '').trim();
  const blocks: LayoutBlock[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      blocks.push({ id: `separator-${blocks.length}`, type: 'paragraph', text: '', assetId: null });
      continue;
    }
    const type = /^#{1,6}\s+/.test(line)
      ? 'heading'
      : /^>\s?/.test(line)
        ? 'quote'
        : /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)
          ? 'list'
          : 'paragraph';
    const text = line.replace(
      type === 'heading'
        ? /^#{1,6}\s+/
        : type === 'quote'
          ? /^>\s?/
          : type === 'list'
            ? /^\s*(?:[-*+]\s+|\d+[.)]\s+)/
            : /^$/,
      '',
    );
    const previous = blocks.at(-1);
    if (previous && previous.type === type && previous.text && type !== 'heading') previous.text += '\n' + text;
    else blocks.push({ id: `block-${blocks.length}`, type, text, assetId: null });
  }
  return { title, blocks: blocks.filter((b) => b.text.trim()) };
}
export function createLayout(source: string, contentId: string | null = null): LayoutDocument {
  const article = parseArticle(source);
  const make = (platform: LayoutPlatform): LayoutVariant => ({
    title: article.title,
    blocks: article.blocks.map((b) => ({ ...b, type: platform === 'x' && b.type === 'quote' ? 'paragraph' : b.type })),
    covers: {},
    status: 'draft',
    revision: 0,
    confirmedRevision: null,
  });
  return {
    id: null,
    revision: 0,
    contentId,
    source,
    variants: { wechat: make('wechat'), douyin: make('douyin'), x: make('x') },
  };
}
export function editLayout(document: LayoutDocument, platform: LayoutPlatform, content: LayoutContent): LayoutDocument {
  const current = document.variants[platform];
  if (current.status === 'sent') throw new Error('已送出的版本需先退回修改');
  return {
    ...document,
    variants: {
      ...document.variants,
      [platform]: { ...content, status: 'draft', revision: current.revision + 1, confirmedRevision: null },
    },
  };
}
export function layoutPayload(document: LayoutDocument) {
  const content = (v: LayoutVariant) => ({ title: v.title, blocks: v.blocks, covers: v.covers });
  return {
    contentId: document.contentId,
    source: document.source,
    variants: {
      wechat: content(document.variants.wechat),
      douyin: content(document.variants.douyin),
      x: content(document.variants.x),
    },
  };
}
export function fitsRatio(asset: Asset, ratio: string) {
  const [w, h] = ratio.split(':').map(Number);
  return asset.width > 0 && asset.height > 0 && Math.abs(asset.width * h - asset.height * w) < 0.01;
}
export function layoutIssues(
  variant: LayoutVariant,
  platform: LayoutPlatform,
  assets: Asset[],
  config: LayoutConfig,
): string[] {
  const issues: string[] = [];
  if (!variant.title.trim()) issues.push('请填写标题');
  if (!variant.blocks.some((b) => b.type !== 'image' && b.text.trim())) issues.push('请填写正文');
  if (variant.blocks.some((b) => b.type === 'image' && !assets.some((a) => a.id === b.assetId)))
    issues.push('有配图无法读取，请重新选择');
  if (platform === 'wechat')
    for (const ratio of config.wechatCoverRatios) {
      const asset = assets.find((a) => a.id === variant.covers[ratio]);
      if (!asset || !fitsRatio(asset, ratio)) issues.push(`请选择 ${ratio} 封面`);
    }
  if (platform === 'douyin') {
    const images = variant.blocks.filter((b) => b.type === 'image');
    if (!images.length) issues.push('请添加图文配图');
    if (images.length > config.douyinMaxImages) issues.push(`配图超过 ${config.douyinMaxImages} 张`);
    if (
      images.some((b) => {
        const a = assets.find((a) => a.id === b.assetId);
        return a && !fitsRatio(a, config.douyinImageRatio);
      })
    )
      issues.push(`配图须为 ${config.douyinImageRatio}`);
  }
  if (platform === 'x' && variant.blocks.some((b) => b.type === 'quote')) issues.push('X 引用应转换为正文');
  return issues;
}
export function canSendLayout(variant: LayoutVariant) {
  return variant.status === 'confirmed' && variant.confirmedRevision === variant.revision;
}
