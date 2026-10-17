import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { contents, assets, publishVideos } from '../db/schema.ts';
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
    const saved: (typeof assets.$inferSelect)[] = [];
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
  const file = files[0],
    id = randomUUID(),
    destination = `data/videos/${id}${file.type === 'video/quicktime' ? '.mov' : '.mp4'}`;
  await mkdir('data/videos', { recursive: true, mode: 0o700 });
  await writeFile(destination, new Uint8Array(await file.arrayBuffer()), { flag: 'wx', mode: 0o600 });
  try {
    const tools = z
      .object({ ffprobePath: z.string(), probeTimeoutMs: z.number().positive() })
      .parse(parse(await readFile('config/media.yaml', 'utf8')));
    const result = await promisify(execFile)(
      tools.ffprobePath,
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=duration,format_name',
        '-of',
        'json',
        destination,
      ],
      { timeout: tools.probeTimeoutMs, maxBuffer: 1024 * 1024 },
    );
    const info = z
      .object({
        streams: z.array(z.object({ width: z.number().int().positive(), height: z.number().int().positive() })).min(1),
        format: z.object({ duration: z.coerce.number().positive(), format_name: z.string().regex(/mov|mp4/) }),
      })
      .parse(JSON.parse(result.stdout));
    db.db
      .insert(publishVideos)
      .values({
        id,
        contentId: content.id,
        name: file.name,
        path: destination,
        bytes: file.size,
        duration: info.format.duration,
        width: info.streams[0].width,
        height: info.streams[0].height,
        updatedAt: new Date().toISOString(),
      })
      .run();
    return { videoId: id, assetIds: [] };
  } catch {
    await rm(destination, { force: true });
    throw new Error('无法读取成片，请确认是有效的 MP4/MOV，并检查 config/media.yaml 中的本机 ffprobe。');
  }
}
