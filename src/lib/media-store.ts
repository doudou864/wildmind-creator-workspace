import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase, type WorkspaceDatabase } from '../db/database.ts';
import { assets, contents, topics, imageDrafts, imageGenerations } from '../db/schema.ts';
import { loadImageConfig } from './image-config.ts';
import {
  imageDraftSchema,
  imageSlots,
  canReuseAsset,
  selectAssetVersion,
  type ImageDraftInput,
} from './image-model.ts';
import { contentInputSchema, type Content } from './content-model.ts';
import { imageInfo, imageRatio, assetFile, normalizeImage } from './image-files.ts';
import { generateImage, imageFailure, loadGenerationConfig } from '../ai/image-generation.ts';
import { acquireJobLock } from '../jobs/lock.ts';
import { shanghaiDate } from '../browser/policy.ts';
export async function usingDatabase<T>(operation: (db: WorkspaceDatabase) => Promise<T> | T) {
  const db = openDatabase();
  try {
    return await operation(db);
  } finally {
    db.sqlite.close();
  }
}
export function associations(db: WorkspaceDatabase, input: { topicId: string | null; contentId: string | null }) {
  if (input.topicId && !db.db.select().from(topics).where(eq(topics.id, input.topicId)).get())
    throw new Error('关联选题不存在。');
  const content = input.contentId ? db.db.select().from(contents).where(eq(contents.id, input.contentId)).get() : null;
  if (input.contentId && !content) throw new Error('关联作品不存在。');
  if (content && input.topicId !== content.topicId) throw new Error('作品与选题不匹配。');
  return content;
}
export function createContent(db: WorkspaceDatabase, raw: unknown): Content {
  const input = contentInputSchema.parse(raw);
  associations(db, { topicId: input.topicId, contentId: null });
  const result = { ...input, id: randomUUID(), videoCovers: {}, updatedAt: new Date().toISOString() };
  db.db.insert(contents).values(result).run();
  return result;
}
export async function saveImageDraft(db: WorkspaceDatabase, raw: unknown, id?: string) {
  const input = imageDraftSchema.parse(raw);
  associations(db, input);
  if (id && !db.db.select().from(imageDrafts).where(eq(imageDrafts.id, id)).get()) throw new Error('草稿不存在。');
  const record = { id: id ?? randomUUID(), input, updatedAt: new Date().toISOString() };
  db.db
    .insert(imageDrafts)
    .values(record)
    .onConflictDoUpdate({ target: imageDrafts.id, set: { input, updatedAt: record.updatedAt } })
    .run();
  return { ...input, id: record.id, updatedAt: record.updatedAt };
}
export async function selectImage(db: WorkspaceDatabase, id: string) {
  const config = await loadImageConfig();
  return db.db.transaction((tx) => {
    const result = selectAssetVersion(
      tx.select().from(assets).all(),
      tx.select().from(contents).all(),
      id,
      config,
      new Date().toISOString(),
    );
    tx.update(assets)
      .set({ selected: false, updatedAt: result.asset.updatedAt })
      .where(eq(assets.familyId, result.asset.familyId))
      .run();
    tx.update(assets).set({ selected: true }).where(eq(assets.id, id)).run();
    if (result.content) tx.update(contents).set(result.content).where(eq(contents.id, result.content.id)).run();
    return result.asset;
  });
}
export type UploadInput = {
  title: string;
  purposeId: string;
  topicId: string | null;
  contentId: string | null;
  prompt: string;
  parentAssetId: string | null;
};
function versionFields(db: WorkspaceDatabase, input: UploadInput) {
  const parent = input.parentAssetId
    ? db.db.select().from(assets).where(eq(assets.id, input.parentAssetId)).get()
    : null;
  if (input.parentAssetId && !parent) throw new Error('原素材不存在。');
  if (
    parent &&
    (parent.contentId !== input.contentId || parent.topicId !== input.topicId || parent.purposeId !== input.purposeId)
  )
    throw new Error('修改版必须沿用原素材的用途和关联。');
  const familyId = parent?.familyId ?? randomUUID();
  const version =
    Number(
      db.db
        .select({ value: sql<number>`max(${assets.version})` })
        .from(assets)
        .where(eq(assets.familyId, familyId))
        .get()?.value ?? 0,
    ) + 1;
  return { familyId, version };
}
export async function uploadImage(db: WorkspaceDatabase, input: UploadInput, bytes: Uint8Array) {
  const config = await loadImageConfig();
  associations(db, input);
  if (!config.purposes.some((p) => p.id === input.purposeId && p.contentMode !== 'upload'))
    throw new Error('请选择图片实际用途。');
  if (!bytes.length || bytes.length > config.uploadMaxMB * 1024 * 1024) throw new Error('图片文件为空或超过上传上限。');
  const id = randomUUID(),
    file = `data/assets/${id}.image`;
  await mkdir('data/assets', { recursive: true, mode: 0o700 });
  await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
  try {
    const info = await imageInfo(file);
    const now = new Date().toISOString();
    return db.db.transaction((tx) => {
      const version = versionFields(db, input);
      const record = {
        id,
        ...version,
        title: input.title,
        purposeId: input.purposeId,
        topicId: input.topicId,
        contentId: input.contentId,
        ratio: imageRatio(info.width, info.height),
        width: info.width,
        height: info.height,
        mime: info.mime,
        path: file,
        source: 'upload' as const,
        prompt: input.prompt,
        selected: false,
        createdAt: now,
        updatedAt: now,
      };
      tx.insert(assets).values(record).run();
      return record;
    });
  } catch (e) {
    await rm(file, { force: true });
    throw e;
  }
}
export function usedImages(db: WorkspaceDatabase, date: string) {
  return Number(
    db.db
      .select({ n: sql<number>`coalesce(sum(${imageGenerations.calls}),0)` })
      .from(imageGenerations)
      .where(eq(imageGenerations.usageDate, date))
      .get()?.n ?? 0,
  );
}
export async function generateAssets(db: WorkspaceDatabase, raw: unknown, generate = generateImage) {
  const input = imageDraftSchema.parse(raw),
    config = await loadImageConfig(),
    generation = await loadGenerationConfig();
  associations(db, input);
  const purpose = config.purposes.find((p) => p.id === input.purposeId),
    style = config.styles.find((s) => s.id === input.styleId);
  if (!purpose || purpose.contentMode === 'upload' || !style) throw new Error('请选择有效的生图用途与风格。');
  if (!purpose.ratios.includes(input.ratio)) throw new Error('请选择配置中支持的比例。');
  const parent = input.parentAssetId
    ? db.db.select().from(assets).where(eq(assets.id, input.parentAssetId)).get()
    : null;
  versionFields(db, { ...input });
  if (input.parentAssetId && (!input.editInstruction.trim() || !parent)) throw new Error('请填写修改要求并选择原图。');
  const allAssets = db.db.select().from(assets).all();
  const slots = imageSlots(input, config).filter((slot) => {
    const reused = input.existingAssets[slot.key];
    if (!reused) return true;
    const asset = allAssets.find((a) => a.id === reused);
    if (!asset || !canReuseAsset(asset, slot)) throw new Error('复用素材不存在或比例不符。');
    return false;
  });
  if (!slots.length) throw new Error('没有需要生成的图片，请填写内容或检查已复用素材。');
  const release = await acquireJobLock(path.join(path.dirname(db.filename), 'jobs/image-generation.pid'));
  if (!release) throw new Error('已有图片正在生成，请等待完成后再试。');
  const staged: (typeof assets.$inferInsert)[] = [],
    jobIds: string[] = [],
    files: string[] = [];
  try {
    // A dead process may leave usage logs, but never library entries; preserve its charged attempt.
    db.db
      .update(imageGenerations)
      .set({ status: 'failed', finishedAt: new Date().toISOString(), reason: '上次生图进程中断，未保存素材。' })
      .where(eq(imageGenerations.status, 'running'))
      .run();
    if (usedImages(db, shanghaiDate()) + slots.length > generation.dailyLimit)
      throw new Error(
        `今天生图次数已用${usedImages(db, shanghaiDate())}/${generation.dailyLimit}，本次需要${slots.length}次，超过每日上限；请明天再试或调整配置。`,
      );
    await mkdir('data/assets', { recursive: true, mode: 0o700 });
    await mkdir('data/asset-sources', { recursive: true, mode: 0o700 });
    for (const slot of slots) {
      if (usedImages(db, shanghaiDate()) >= generation.dailyLimit)
        throw new Error('今天生图次数已达到每日上限，请明天再试。');
      const jobId = randomUUID(),
        startedAt = new Date().toISOString();
      jobIds.push(jobId);
      db.db
        .insert(imageGenerations)
        .values({
          id: jobId,
          kind: parent ? 'edit' : 'generate',
          usageDate: shanghaiDate(),
          status: 'running',
          startedAt,
          calls: 1,
        })
        .run();
      const prompt = `用途：${purpose.name}。风格：${style.prompt}。任务：${input.title}。要求严格比例${slot.ratio}，主体边缘留安全余量。\n${parent ? '仅修改所附原图，其他部分尽量保持不变。修改要求：' : ''}${slot.text}\n补充：${input.content}`;
      try {
        const result = await generate(prompt, parent ? await assetFile(parent.path) : null, generation);
        const id = randomUUID(),
          source = `data/asset-sources/${id}.png`,
          destination = `data/assets/${id}.png`;
        files.push(source, destination);
        await copyFile(result.file, source);
        const info = await normalizeImage(source, destination, slot.ratio, generation.maxCropFraction);
        const now = new Date().toISOString();
        staged.push({
          id,
          ...versionFields(db, input),
          title: `${input.title} · ${slot.label}`,
          purposeId: input.purposeId,
          ratio: slot.ratio,
          path: destination,
          width: info.width,
          height: info.height,
          mime: info.mime,
          topicId: input.topicId,
          contentId: input.contentId,
          source: 'ai',
          prompt,
          selected: false,
          createdAt: now,
          updatedAt: now,
        });
        db.db
          .update(imageGenerations)
          .set({
            threadId: result.threadId,
            sourcePath: source,
            finishedAt: now,
            durationMs: Date.parse(now) - Date.parse(startedAt),
          })
          .where(eq(imageGenerations.id, jobId))
          .run();
      } catch (e) {
        const now = new Date().toISOString();
        db.db
          .update(imageGenerations)
          .set({
            status: 'failed',
            finishedAt: now,
            durationMs: Date.parse(now) - Date.parse(startedAt),
            reason: imageFailure(e),
          })
          .where(eq(imageGenerations.id, jobId))
          .run();
        throw new Error(imageFailure(e));
      }
    }
    db.db.transaction((tx) => {
      for (const [i, asset] of staged.entries()) {
        tx.insert(assets).values(asset).run();
        tx.update(imageGenerations)
          .set({ status: 'success', assetId: asset.id, reason: null })
          .where(eq(imageGenerations.id, jobIds[i]))
          .run();
      }
    });
    return { assets: staged, message: `已生成${staged.length}张并存入素材库；原图保留，近似比例仅作轻裁。` };
  } catch (e) {
    for (const id of jobIds)
      db.db
        .update(imageGenerations)
        .set({ status: 'failed', reason: imageFailure(e), sourcePath: null, finishedAt: new Date().toISOString() })
        .where(and(eq(imageGenerations.id, id), eq(imageGenerations.status, 'running')))
        .run();
    await Promise.all(files.map((file) => rm(file, { force: true })));
    throw e;
  } finally {
    await release();
  }
}
