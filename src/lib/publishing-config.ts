import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { publishingConfigSchema } from './publishing-model.ts';
import type { Platform } from './config';
export async function loadPublishingConfig(platforms: Platform[]) {
  const config = publishingConfigSchema.parse(
    parse(await readFile(path.join(process.cwd(), 'config/publishing-templates.yaml'), 'utf8')),
  );
  if (new Set(config.templates.map((t) => t.platformId)).size !== config.templates.length)
    throw new Error('发布模板平台重复');
  for (const t of config.templates) {
    if (!platforms.some((p) => p.id === t.platformId)) throw new Error(`发布模板引用了未知平台 ${t.platformId}`);
    if (t.kinds.includes('video') && (!t.videoCoverRatio || !config.requiredVideoRatios.includes(t.videoCoverRatio)))
      throw new Error('视频封面比例映射未配置');
  }
  return config;
}
