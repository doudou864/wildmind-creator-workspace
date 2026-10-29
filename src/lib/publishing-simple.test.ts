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
  matchesCoverRatio,
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

test('已实测视频平台不因未公布的正文上限阻止审核发布，未核验平台仍阻止', async () => {
  const f = await setup();
  try {
    const { publishSettingIssues, makePublishSetting } = await import('./publishing-model');
    const platforms = (await loadConfig()).platforms;
    const setting = makePublishSetting('channels', '测试视频', f.config);
    const data = publishingData(f.db);
    const issues = publishSettingIssues(draft(), setting, data, f.config, platforms, Date.now());
    expect(issues).not.toContain('视频号发布模板待核验');
    expect(issues).toContain('视频号账号尚未就绪');
    const unverified = { ...f.config, templates: f.config.templates.map((t) => ({ ...t, videoVerified: false })) };
    expect(publishSettingIssues(draft(), setting, data, unverified, platforms, Date.now())).toContain(
      '视频号发布模板待核验',
    );
  } finally {
    await f.close();
  }
});

test('生成横图的像素取整误差不应导致列表隐藏或保存失败；明显错误比例仍拒绝', async () => {
  const f = await setup();
  try {
    expect(matchesCoverRatio(1672, 941, '16:9', f.config)).toBe(true);
    expect(matchesCoverRatio(1664, 936, '16:9', f.config)).toBe(true);
    expect(matchesCoverRatio(1672, 941, '16:9', { ...f.config, coverRatioTolerancePixels: 0 })).toBe(false);
    for (const [w, h] of [
      [1448, 1086],
      [941, 1672],
      [1672, 944],
      [0, 0],
      [NaN, 941],
    ])
      expect(matchesCoverRatio(w, h, '16:9', f.config)).toBe(false);
    const stamp = new Date().toISOString();
    f.db.db
      .insert(assets)
      .values({
        id: 'rounded-cover',
        fixture: true,
        familyId: 'rounded-cover',
        title: 'fixture',
        purposeId: 'video_cover',
        ratio: '1672:941',
        path: '/fixture/rounded.png',
        width: 1672,
        height: 941,
        mime: 'image/png',
        source: 'ai',
        prompt: '',
        version: 1,
        selected: false,
        createdAt: stamp,
        updatedAt: stamp,
      })
      .run();
    const batch = await savePublishing(f.db, {
      ...draft(),
      videoInput: { ...draft().videoInput, covers: { '16:9': 'rounded-cover' } },
    });
    const data = publishingData(f.db);
    expect(videoDraftCovers(data.batches[0].draft, data, f.config).find((c) => c.ratio === '16:9')?.asset?.id).toBe(
      'rounded-cover',
    );
    expect(batch.draft.videoInput?.covers['16:9']).toBe('rounded-cover');
    expect(data.assets[0]).toMatchObject({ width: 1672, height: 941, ratio: '1672:941', contentId: null });
  } finally {
    await f.close();
  }
});
