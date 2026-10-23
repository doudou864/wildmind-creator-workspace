import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { initializeDatabase } from '../db/database';
import { assets, contents, publishRecords } from '../db/schema';
import { savePublishing, publishingData } from './publishing-store';
import {
  newPublishDraft,
  parsePublishTags,
  videoDraftCovers,
  platformMaterialKey,
  receiptStatus,
} from './publishing-model';
import { loadConfig } from './config';
import { loadPublishingConfig } from './publishing-config';

async function setup() {
  const dir = await mkdtemp(path.join(tmpdir(), 'publish-simple-fixture-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  const config = await loadPublishingConfig((await loadConfig()).platforms);
  return {
    db,
    config,
    async close() {
      db.sqlite.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
const draft = () => ({
  ...newPublishDraft('video'),
  commonCopy: { title: '测试专用主题', description: '', tags: ['AI'] },
  videoInput: { topicId: null, path: '/test-only/video.mp4', covers: {} as Record<string, string> },
});

test('四项输入不要求先创建作品；连续保存及重新读取仍只有同一条关联，失败事务不留空作品', async () => {
  const f = await setup();
  try {
    const first = await savePublishing(f.db, draft());
    const second = await savePublishing(
      f.db,
      { ...draft(), commonCopy: { title: '改好的主题', description: '', tags: [] } },
      first.id,
      first.revision,
    );
    expect(second.draft.contentId).toBe(first.draft.contentId);
    expect(f.db.db.select().from(contents).all()).toHaveLength(1);
    expect(publishingData(f.db).batches[0].draft.videoInput?.path).toBe('/test-only/video.mp4');
    await expect(
      savePublishing(f.db, { ...draft(), videoInput: { ...draft().videoInput, covers: { '3:4': 'missing' } } }),
    ).rejects.toThrow('封面');
    expect(f.db.db.select().from(contents).all()).toHaveLength(1);
    await expect(savePublishing(f.db, draft(), first.id, first.revision)).rejects.toThrow('其他窗口');
  } finally {
    await f.close();
  }
});

test('可复用生图素材且不改变原图归属；真实尺寸不符拒绝，换封面和路径使旧截图失效', async () => {
  const f = await setup();
  try {
    const stamp = new Date().toISOString();
    for (const id of ['cover-a', 'cover-b'])
      f.db.db
        .insert(assets)
        .values({
          id,
          fixture: true,
          familyId: id,
          contentId: null,
          topicId: null,
          title: '测试封面',
          purposeId: 'illustration',
          ratio: '3:4',
          path: '/test-only/cover.png',
          width: 750,
          height: 1000,
          mime: 'image/png',
          source: 'ai',
          prompt: '',
          version: 1,
          selected: false,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .run();
    const input = {
      ...draft(),
      videoInput: { ...draft().videoInput, covers: { '3:4': 'cover-a' } },
      settings: [
        {
          platformId: 'douyin',
          individuallyEdited: false,
          title: '测试专用主题',
          description: '',
          tags: ['AI'],
          scheduleAt: null,
        },
      ],
    };
    const batch = await savePublishing(f.db, input);
    const data = publishingData(f.db);
    expect(videoDraftCovers(batch.draft, data, f.config)[0].asset?.id).toBe('cover-a');
    expect(data.assets[0].contentId).toBeNull();
    await expect(
      savePublishing(f.db, { ...input, videoInput: { ...input.videoInput, covers: { '16:9': 'cover-a' } } }),
    ).rejects.toThrow('比例');
    const receipt = {
      id: 'r',
      batchId: batch.id,
      platformId: 'douyin',
      status: 'ready' as const,
      screenshotAssetId: 's',
      uploadedAt: stamp,
      materials: platformMaterialKey(batch.draft, 'douyin', data, f.config),
      failureStage: null,
      title: input.commonCopy.title,
      platformPostId: null,
      url: null,
      publishedAt: null,
      reason: null,
      safeToRetry: false,
      revision: 0,
    };
    for (const videoInput of [
      { ...input.videoInput, path: '/test-only/new.mp4' },
      { ...input.videoInput, covers: { '3:4': 'cover-b' } },
    ]) {
      expect(receiptStatus(receipt, { ...batch.draft, videoInput }, data, f.config, Date.now(), 2)).toBe('expired');
    }
    f.db.db.update(publishRecords).set({ state: 'prepared' }).where(eq(publishRecords.id, batch.id)).run();
    await expect(
      savePublishing(
        f.db,
        { ...batch.draft, videoInput: { ...input.videoInput, path: '/test-only/new.mp4' } },
        batch.id,
        batch.revision,
      ),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test('话题可含半角或全角井号，空白不会破坏自动保存，去重保留顺序', () => {
  expect(parsePublishTags(' #AI  ＃效率工具\n#AI #创作 ')).toEqual(['AI', '效率工具', '创作']);
  expect(parsePublishTags('#  ')).toEqual([]);
});
