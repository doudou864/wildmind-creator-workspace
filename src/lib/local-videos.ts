import { loadPublishingConfig } from './publishing-config.ts';
import { loadConfig } from './config.ts';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'yaml';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { WorkspaceDatabase } from '../db/database.ts';
import { contents, publishVideos, publishRecords } from '../db/schema.ts';
import { assetFile } from './image-files.ts';
export const mediaSettingsSchema = z.object({
  ffprobePath: z.string(),
  probeTimeoutMs: z.number().positive(),
  videoListLimit: z.number().int().min(1).max(100).default(20),
  finishedVideoDirectories: z.array(z.string().refine(path.isAbsolute, '成片目录必须使用绝对路径')).default([]),
});
export type MediaSettings = z.infer<typeof mediaSettingsSchema>;
export async function mediaSettings() {
  return mediaSettingsSchema.parse(parse(await readFile('config/media.yaml', 'utf8')));
}
export async function allowedVideo(file: string, settings: MediaSettings) {
  if (!path.isAbsolute(file)) throw Error('请填写成片文件夹内的绝对路径');
  let full: string;
  try {
    full = await realpath(file);
  } catch {
    throw Error('成片不存在或已移动，请重新选择');
  }
  const roots = await Promise.all(settings.finishedVideoDirectories.map((p) => realpath(p).catch(() => null)));
  if (!roots.some((root) => root && full.startsWith(root + path.sep)))
    throw Error('文件不在允许的成片文件夹内，请检查 config/media.yaml');
  if (!/\.(mp4|mov)$/i.test(full) || (await stat(full)).isFile() === false) throw Error('请选择有效的 MP4/MOV 成片');
  return full;
}
export async function fingerprint(file: string) {
  const before = await stat(file),
    hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const after = await stat(file);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino)
    throw Error('文件正在变化，写入完成后再选择');
  return { bytes: after.size, mtimeMs: after.mtimeMs, sha256: hash.digest('hex') };
}
async function probe(file: string, settings: MediaSettings) {
  try {
    const result = await promisify(execFile)(
      settings.ffprobePath,
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
        file,
      ],
      { timeout: settings.probeTimeoutMs, maxBuffer: 1024 * 1024 },
    );
    const info = z
      .object({
        streams: z.array(z.object({ width: z.number().int().positive(), height: z.number().int().positive() })).min(1),
        format: z.object({ duration: z.coerce.number().positive(), format_name: z.string().regex(/mov|mp4/) }),
      })
      .parse(JSON.parse(result.stdout));
    return { duration: info.format.duration, width: info.streams[0].width, height: info.streams[0].height };
  } catch {
    throw Error('无法读取视频时长或尺寸，请检查成片与本机 ffprobe 配置');
  }
}
export async function listLocalVideos(settings = undefined as MediaSettings | undefined) {
  settings ??= await mediaSettings();
  const candidates: { path: string; name: string; bytes: number; modifiedAt: string }[] = [];
  const rows: ((typeof candidates)[number] & { duration: number; width: number; height: number })[] = [];
  const errors: string[] = [],
    seen = new Set<string>();
  for (const root of settings.finishedVideoDirectories) {
    try {
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.(mp4|mov)$/i.test(entry.name)) continue;
        try {
          const file = await allowedVideo(path.join(root, entry.name), settings);
          if (seen.has(file)) continue;
          seen.add(file);
          const info = await stat(file);
          candidates.push({
            path: file,
            name: entry.name,
            bytes: info.size,
            modifiedAt: new Date(info.mtimeMs).toISOString(),
          });
        } catch (e) {
          errors.push(`${entry.name}：${e instanceof Error ? e.message : '无法读取'}`);
        }
      }
    } catch (e) {
      errors.push(`${root}：${e instanceof Error ? e.message : '无法读取'}`);
    }
  }
  for (const item of candidates
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, settings.videoListLimit)) {
    try {
      rows.push({ ...item, ...(await probe(item.path, settings)) });
    } catch (e) {
      errors.push(`${item.name}：${e instanceof Error ? e.message : '无法读取'}`);
    }
  }
  return { directories: settings.finishedVideoDirectories, items: rows, errors };
}
export async function referenceVideo(
  db: WorkspaceDatabase,
  contentId: string,
  file: string,
  settings = undefined as MediaSettings | undefined,
) {
  const content = db.db.select().from(contents).where(eq(contents.id, contentId)).get();
  if (!content || content.form !== '视频') throw Error('请先选择视频作品');
  settings ??= await mediaSettings();
  const full = await allowedVideo(file, settings);
  const limit = (await loadPublishingConfig((await loadConfig()).platforms)).videoMaxMB;
  if ((await stat(full)).size > limit * 1024 * 1024) throw Error(`成片超过 ${limit} MB 上限`);
  const mark = await fingerprint(full),
    info = await probe(full, settings);
  const checked = await fingerprint(full);
  if (JSON.stringify(mark) !== JSON.stringify(checked)) throw Error('读取期间文件变化，请重新选择');
  const old = db.db
    .select()
    .from(publishVideos)
    .all()
    .find(
      (v) => v.contentId === contentId && v.path === full && JSON.stringify(v.fingerprint) === JSON.stringify(mark),
    );
  if (old) return old;
  const record = {
    id: randomUUID(),
    contentId,
    name: path.basename(full),
    path: full,
    bytes: mark.bytes,
    fingerprint: mark,
    ...info,
    updatedAt: new Date().toISOString(),
  };
  db.db.insert(publishVideos).values(record).run();
  return record;
}
export async function verifiedVideoPath(
  video: typeof publishVideos.$inferSelect,
  settings = undefined as MediaSettings | undefined,
) {
  if (!video.fingerprint) return assetFile(video.path); // Old copied files remain untouched.
  settings ??= await mediaSettings();
  const full = await allowedVideo(video.path, settings),
    mark = await fingerprint(full);
  if (JSON.stringify(mark) !== JSON.stringify(video.fingerprint))
    throw Error('成片已改变（大小、修改时间或内容不一致），请重新选择后检查');
  return full;
}
export async function verifyBatchFiles(db: WorkspaceDatabase, id: string) {
  const batch = db.db.select().from(publishRecords).where(eq(publishRecords.id, id)).get();
  if (!batch || batch.abandonedAt) throw Error('发布准备不存在或已放弃');
  if (batch.draft.videoId) {
    const video = db.db.select().from(publishVideos).where(eq(publishVideos.id, batch.draft.videoId)).get();
    if (!video) throw Error('成片记录不存在');
    await verifiedVideoPath(video);
  }
}
