import { randomUUID } from 'node:crypto';
import { blocksFromDocument } from './rich-document.ts';
import { and, eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { layouts, contents, assets, publishSnapshots } from '../db/schema.ts';
import {
  layoutSaveSchema,
  layoutActionSchema,
  layoutContentSchema,
  layoutIssues,
  type LayoutDocument,
} from './layout-model.ts';
import { loadLayoutConfig } from './layout-config.ts';
import { CodexJudgment, type Judgment } from '../ai/structured.ts';
export function saveLayout(db: WorkspaceDatabase, raw: unknown, id?: string): LayoutDocument {
  const input = layoutSaveSchema.parse(raw);
  for (const variant of Object.values(input.variants)) {
    if (variant.document) variant.blocks = blocksFromDocument(variant.document);
  }
  const content = input.contentId ? db.db.select().from(contents).where(eq(contents.id, input.contentId)).get() : null;
  if (!content || content.form !== '图文') throw new Error('请选择图文作品后保存。');
  return db.db.transaction((tx) => {
    const old = id ? tx.select().from(layouts).where(eq(layouts.id, id)).get() : null;
    if (id && !old) throw new Error('稿件不存在。');
    const now = new Date().toISOString();
    const variants = {} as LayoutDocument['variants'];
    for (const platform of ['wechat', 'douyin', 'x'] as const) {
      const previous = old?.variants[platform];
      const same =
        previous &&
        JSON.stringify(layoutContentSchema.parse(previousContent(previous))) ===
          JSON.stringify(input.variants[platform]);
      if (previous?.status === 'sent' && (!same || old?.contentId !== input.contentId))
        throw new Error('已确认版本须先退回修改。');
      variants[platform] = same ? previous : { ...input.variants[platform], status: 'draft', updatedAt: now };
    }
    const record = { ...input, id: id ?? randomUUID(), variants, updatedAt: now };
    tx.insert(layouts)
      .values(record)
      .onConflictDoUpdate({ target: layouts.id, set: { ...input, variants, updatedAt: now } })
      .run();
    return record;
  });
}
function previousContent(v: LayoutDocument['variants']['x']) {
  return {
    title: v.title,
    blocks: v.blocks,
    covers: v.covers,
    ...(v.document ? { document: v.document } : {}),
    ...(v.theme ? { theme: v.theme } : {}),
  };
}
export async function actOnLayout(
  db: WorkspaceDatabase,
  id: string,
  raw: unknown,
  judgment: Judgment = new CodexJudgment(),
): Promise<LayoutDocument> {
  const input = layoutActionSchema.parse(raw),
    config = await loadLayoutConfig();
  const old = db.db.select().from(layouts).where(eq(layouts.id, id)).get();
  if (!old) throw new Error('稿件不存在。');
  const variant = old.variants[input.platform];
  if (input.action !== 'revise' && variant.status === 'sent') throw new Error('该版本已经确认，请先退回修改。');
  let revised = previousContent(variant);
  if (input.action === 'ai') {
    revised = {
      covers: variant.covers,
      ...(await judgment.read(
        layoutContentSchema.omit({ covers: true }),
        `只修改指定平台版本，保留事实，不添加不存在的图片 id；允许的图片 id：${JSON.stringify(db.db.select({ id: assets.id }).from(assets).all())}。平台：${input.platform}；修改要求：${input.instruction}；原稿：${JSON.stringify(revised)}`,
      )),
    };
    const ids = new Set(
      db.db
        .select({ id: assets.id })
        .from(assets)
        .all()
        .map((a) => a.id),
    );
    if (
      revised.blocks.some((b) => b.type === 'image' && !ids.has(b.assetId ?? '')) ||
      Object.values(revised.covers).some((id) => !ids.has(id))
    )
      throw new Error('AI 返回了不存在的图片，原稿已保留。');
  }
  return db.db.transaction((tx) => {
    const current = tx.select().from(layouts).where(eq(layouts.id, id)).get();
    if (!current || current.updatedAt !== old.updatedAt) throw new Error('稿件已变化，请刷新后再操作。');
    const now = new Date().toISOString();
    if (input.action === 'confirm-send') {
      const issues = layoutIssues(variant, input.platform, tx.select().from(assets).all(), config);
      if (issues.length) throw new Error(issues.join('；'));
      if (!old.contentId) throw new Error('请先关联作品。');
      tx.insert(publishSnapshots)
        .values({
          id: randomUUID(),
          layoutId: id,
          layoutUpdatedAt: variant.updatedAt,
          contentId: old.contentId,
          platform: input.platform,
          content: previousContent(variant),
          confirmedAt: now,
          state: 'ready',
          updatedAt: now,
        })
        .run();
    }
    if (input.action === 'revise') {
      const existing = tx
        .select()
        .from(publishSnapshots)
        .where(and(eq(publishSnapshots.layoutId, id), eq(publishSnapshots.platform, input.platform)))
        .all();
      if (existing.some((s) => s.state === 'queued')) throw new Error('该版本正在发布队列中，不能退回。');
      tx.update(publishSnapshots)
        .set({ state: 'returned', updatedAt: now })
        .where(
          and(
            eq(publishSnapshots.layoutId, id),
            eq(publishSnapshots.platform, input.platform),
            eq(publishSnapshots.state, 'ready'),
          ),
        )
        .run();
    }
    const record = {
      ...old,
      updatedAt: now,
      variants: {
        ...old.variants,
        [input.platform]: {
          ...revised,
          status: input.action === 'confirm-send' ? ('sent' as const) : ('draft' as const),
          updatedAt: now,
        },
      },
    };
    tx.update(layouts).set({ variants: record.variants, updatedAt: now }).where(eq(layouts.id, id)).run();
    return record;
  });
}
