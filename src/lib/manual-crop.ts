import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import type { WorkspaceDatabase } from '../db/database';
import { imageCrops, assets, contents, imageGenerations } from '../db/schema';
import { assetFile, imageInfo } from './image-files';
export const cropInput = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export function validateManualCrop(
  box: z.infer<typeof cropInput>,
  source: { width: number; height: number; ratio: string },
) {
  cropInput.parse(box);
  const [w, h] = source.ratio.split(':').map(Number);
  if (
    box.x + box.width > source.width ||
    box.y + box.height > source.height ||
    Math.abs(box.width * h - box.height * w) > 0.001
  )
    throw Error('裁剪区域超出图片或比例不符');
  return box;
}
export async function saveManualCrop(db: WorkspaceDatabase, id: string, raw: unknown) {
  const row = db.db.select().from(imageCrops).where(eq(imageCrops.id, id)).get();
  if (!row) throw Error('待裁剪图片不存在');
  if (row.assetId) return db.db.select().from(assets).where(eq(assets.id, row.assetId)).get();
  const box = validateManualCrop(cropInput.parse(raw), row),
    source = await assetFile(row.sourcePath),
    assetId = randomUUID(),
    destination = `data/assets/${assetId}.png`;
  await mkdir('data/assets', { recursive: true });
  await promisify(execFile)('/usr/bin/sips', [
    '--cropToHeightWidth',
    String(box.height),
    String(box.width),
    '--cropOffset',
    String(box.y),
    String(box.x),
    source,
    '--out',
    destination,
  ]);
  const info = await imageInfo(destination);
  if (info.width !== box.width || info.height !== box.height) throw Error('裁剪尺寸校验失败');
  const now = new Date().toISOString(),
    content = row.contentId ? db.db.select().from(contents).where(eq(contents.id, row.contentId)).get() : null;
  return db.db.transaction((tx) => {
    const current = tx.select().from(imageCrops).where(eq(imageCrops.id, id)).get()!;
    if (current.assetId) return tx.select().from(assets).where(eq(assets.id, current.assetId)).get();
    const asset = {
      ...row.metadata,
      version: Math.max(
        row.metadata.version,
        ...tx
          .select()
          .from(assets)
          .all()
          .filter((a) => a.familyId === row.metadata.familyId)
          .map((a) => a.version + 1),
      ),
      id: assetId,
      fixture: content?.fixture ?? false,
      path: destination,
      ratio: row.ratio,
      width: info.width,
      height: info.height,
      mime: info.mime,
      source: 'ai' as const,
      selected: false,
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(assets).values(asset).run();
    tx.update(imageCrops)
      .set({ assetId, crop: { ...box, method: 'manual' }, updatedAt: now })
      .where(eq(imageCrops.id, id))
      .run();
    tx.update(imageGenerations)
      .set({ assetId, reason: '人工裁剪确认' })
      .where(eq(imageGenerations.id, row.generationId))
      .run();
    return asset;
  });
}
