import { rm } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { contents, assets } from '../db/schema.ts';
import { publishMediaSchema } from './publishing-model.ts';
import { loadPublishingConfig } from './publishing-config.ts';
import { loadConfig } from './config.ts';
import { uploadImage } from './media-store.ts';
export async function storePublishMedia(db: WorkspaceDatabase, raw: unknown, files: File[]) {
  const input = publishMediaSchema.parse(raw),
    config = await loadPublishingConfig((await loadConfig()).platforms);
  const content = db.db.select().from(contents).where(eq(contents.id, input.contentId)).get();
  if (!content || content.form !== (input.kind === 'video' ? '视频' : '图文')) throw new Error('素材与作品形式不符。');
  const video = input.kind === 'video',
    max = video ? config.videoMaxMB : config.imageMaxMB;
  if (!files.length || (video && files.length !== 1) || (!video && files.length > config.xhsMaxImages))
    throw new Error('文件数量不符合要求。');
  if (
    files.some(
      (f) => !f.size || f.size > max * 1024 * 1024 || !(video ? config.videoTypes : config.imageTypes).includes(f.type),
    )
  )
    throw new Error('文件为空、过大或格式不支持。');
  if (!video) {
    const saved: Awaited<ReturnType<typeof uploadImage>>[] = [];
    try {
      for (const file of files)
        saved.push(
          await uploadImage(
            db,
            {
              title: file.name,
              purposeId: 'free',
              topicId: content.topicId,
              contentId: content.id,
              prompt: '用户上传的自制图文素材',
              parentAssetId: null,
            },
            new Uint8Array(await file.arrayBuffer()),
          ),
        );
      return { videoId: null, assetIds: saved.map((a) => a.id) };
    } catch (e) {
      for (const asset of saved) {
        db.db.delete(assets).where(eq(assets.id, asset.id)).run();
        await rm(asset.path, { force: true });
      }
      throw e;
    }
  }
  throw new Error('视频不再复制到工作台，请从成片文件夹选择或粘贴允许目录内的绝对路径。');
}
