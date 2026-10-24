import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { initializeDatabase } from '../db/database';
import { assets, publishReceipts, publishRecords } from '../db/schema';
import { publishingData, savePublishing } from '../lib/publishing-store';
import {
  newPublishDraft,
  makePublishSetting,
  platformMaterialKey,
  publishMaterialKey,
  publishActionSchema,
} from '../lib/publishing-model';
import { loadConfig } from '../lib/config';
import { loadPublishingConfig } from '../lib/publishing-config';
import { fingerprint } from '../lib/local-videos';
import { registerPublishingTask, readPublishingTask, writePublishingTask } from './publishing-tasks';
import { readUploadRun, writeUploadRun } from './publishing-upload-state';
import { prepareDirectPublishingSubmit } from './publishing-submit';
import { enqueuePublishingUpload } from './publishing-upload';
import { runPublishingUpload } from './publishing-worker';
import { runPublishingSubmit } from './publishing-submit';
import * as browser from '../browser/publishing-runner';
import { closePublishingBrowser, pausePublishingBrowser } from '../browser/publishing-task';
import { CodexJudgment } from '../ai/structured';
import { readState } from '../collectors/state';
vi.mock('../browser/publishing-task', () => ({
  resumePublishingBrowser: vi.fn(),
  pausePublishingBrowser: vi.fn(),
  closePublishingBrowser: vi.fn(),
}));
vi.mock('../browser/publishing-runner', async (original) => ({
  ...(await original<typeof import('../browser/publishing-runner')>()),
  navigatePublishing: vi.fn(),
  waitPublishingAccount: vi.fn(),
  publishingObservation: vi.fn(),
  publishingPageCall: vi.fn(),
  screenshotPublishing: vi.fn(),
  beginVideoUpload: vi.fn(),
}));
vi.mock('node:fs/promises', async (original) => ({
  ...(await original<typeof import('node:fs/promises')>()),
  copyFile: vi.fn(),
}));
vi.mock('../lib/image-files', async (original) => ({
  ...(await original<typeof import('../lib/image-files')>()),
  assetFile: vi.fn(async (file) => file),
  imageInfo: vi.fn(async (file) => {
    const [, width, height] = file.match(/(\d+)x(\d+)/);
    return { width: Number(width), height: Number(height), mime: 'image/png' };
  }),
}));
vi.mock('../lib/local-videos', async (original) => ({
  ...(await original<typeof import('../lib/local-videos')>()),
  fingerprint: vi.fn(async () => ({ sha256: 'fixture' })),
  inspectLocalVideo: vi.fn(async (file) => ({
    path: file,
    fingerprint: { sha256: 'new-fixture' },
    bytes: 1,
    width: 1920,
    height: 1080,
    duration: 1,
  })),
}));
afterEach(() => vi.restoreAllMocks());
async function fixture(direct = true) {
  const dir = await mkdtemp(path.join(tmpdir(), 'publishing-direct-fixture-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  const config = await loadPublishingConfig((await loadConfig()).platforms);
  const now = new Date().toISOString();
  const covers: Record<string, string> = {};
  for (const [ratio, width, height] of [
    ['3:4', 750, 1000],
    ['4:3', 1000, 750],
    ['16:9', 1600, 900],
  ] as const) {
    const id = 'fixture-' + ratio;
    covers[ratio] = id;
    db.db
      .insert(assets)
      .values({
        id,
        fixture: true,
        familyId: id,
        title: id,
        purposeId: 'video_cover',
        ratio,
        path: `/fixture/cover-${width}x${height}.png`,
        width,
        height,
        mime: 'image/png',
        source: 'upload',
        prompt: 'fixture',
        version: 1,
        selected: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }
  const batch = await savePublishing(db, {
    ...newPublishDraft('video'),
    commonCopy: { title: '隔离测试', description: '', tags: [] },
    videoInput: { topicId: null, path: '/fixture/video.mp4', covers },
    settings: ['douyin', 'channels'].map((id) => ({ ...makePublishSetting(id, '隔离测试', config), scheduleAt: null })),
  });
  const task = registerPublishingTask(db, batch.id, {
    process: { pid: process.pid, command: 'fixture', startedAt: 'fixture' },
    browser: { spaceId: 999, name: 'fixture' },
  });
  writeUploadRun(db, batch.id, {
    requestId: 'fixture-request',
    ...(direct ? { publishAuthorization: { approvedAt: now, materials: 'original-frozen-materials' } } : {}),
    video: '/fixture/video.mp4',
    sha256: 'fixture',
    covers,
    platforms: batch.draft.settings.map((s, i) => ({
      id: s.platformId,
      page: 'p' + (i + 2),
      stage: 'ready',
      attempted: false,
      copyPrepared: true,
      accountVerified: true,
      copy: s,
      reason: null,
    })),
  });
  for (const s of batch.draft.settings)
    db.db
      .insert(publishReceipts)
      .values({
        id: 'receipt-' + s.platformId,
        batchId: batch.id,
        platformId: s.platformId,
        status: 'ready',
        title: s.title,
        screenshotAssetId: covers['16:9'],
        uploadedAt: now,
        materials: platformMaterialKey(batch.draft, s.platformId, publishingData(db), config),
        safeToRetry: false,
        updatedAt: now,
      })
      .run();
  return {
    db,
    batch,
    task,
    config,
    close: async () => {
      db.sqlite.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test('普通上传即便全部就绪也没有发布授权，停在审核阶段', async () => {
  const f = await fixture(false);
  try {
    expect(await prepareDirectPublishingSubmit(f.db, f.batch.id, f.task.token)).toBe(false);
    expect(readState(f.db, 'publishing-approval:' + f.batch.id)).toBeUndefined();
    expect(readPublishingTask(f.db, f.batch.id)?.operation).not.toBe('publish');
  } finally {
    await f.close();
  }
});
test('直接发布用原任务/进程进入提交，授权持久化；恢复只追加就绪平台且保留原授权时间', async () => {
  const f = await fixture();
  try {
    const run = readUploadRun(f.db, f.batch.id)!;
    run.platforms[1].stage = 'settings';
    writeUploadRun(f.db, f.batch.id, run);
    f.db.db.update(publishReceipts).set({ status: 'unknown' }).where(eq(publishReceipts.id, 'receipt-channels')).run();
    expect(await prepareDirectPublishingSubmit(f.db, f.batch.id, f.task.token)).toBe(true);
    expect(readPublishingTask(f.db, f.batch.id)).toMatchObject({
      operation: 'publish',
      token: f.task.token,
      process: f.task.process,
    });
    expect(readState(f.db, 'publishing-approval:' + f.batch.id)).toMatchObject({
      receiptIds: ['receipt-douyin'],
      approvedAt: run.publishAuthorization!.approvedAt,
    });
    f.db.db.update(publishReceipts).set({ status: 'published' }).where(eq(publishReceipts.id, 'receipt-douyin')).run();
    run.platforms[1].stage = 'ready';
    writeUploadRun(f.db, f.batch.id, run);
    f.db.db.update(publishReceipts).set({ status: 'ready' }).where(eq(publishReceipts.id, 'receipt-channels')).run();
    expect(await prepareDirectPublishingSubmit(f.db, f.batch.id, f.task.token)).toBe(true);
    expect(readState(f.db, 'publishing-approval:' + f.batch.id)).toMatchObject({
      receiptIds: ['receipt-douyin', 'receipt-channels'],
      approvedAt: run.publishAuthorization!.approvedAt,
    });
    expect(readUploadRun(f.db, f.batch.id)?.publishAuthorization?.materials).toBe('original-frozen-materials');
  } finally {
    await f.close();
  }
});
test.each(['paused', 'deleting'] as const)('异步核对期间%s，不能在边界绕过停止进入发布', async (status) => {
  const f = await fixture();
  try {
    vi.mocked(fingerprint).mockImplementationOnce(async () => {
      writePublishingTask(f.db, { ...readPublishingTask(f.db, f.batch.id)!, status });
      return { sha256: 'fixture', bytes: 1, mtimeMs: 1 };
    });
    await expect(prepareDirectPublishingSubmit(f.db, f.batch.id, f.task.token)).rejects.toThrow('任务已暂停');
    expect(readState(f.db, 'publishing-approval:' + f.batch.id)).toBeUndefined();
  } finally {
    await f.close();
  }
});
test('旧进程不能切换新任务；源文件变更不能使用旧授权', async () => {
  const f = await fixture();
  try {
    await expect(prepareDirectPublishingSubmit(f.db, f.batch.id, 'stale-token')).rejects.toThrow('任务已暂停');
    vi.mocked(fingerprint).mockResolvedValueOnce({ sha256: 'changed', bytes: 1, mtimeMs: 1 });
    await expect(prepareDirectPublishingSubmit(f.db, f.batch.id, f.task.token)).rejects.toThrow('原视频内容已变化');
  } finally {
    await f.close();
  }
});
test('新入口要求明确确认；过期材料在启动浏览器前拒绝', async () => {
  const input = {
    action: 'upload-and-publish',
    expectedRevision: 0,
    requestId: '9337310d-e3f2-4469-9ad2-c257c1918db6',
    platformIds: ['douyin'],
    materials: 'stale',
  };
  expect(publishActionSchema.safeParse(input).success).toBe(false);
  expect(publishActionSchema.safeParse({ ...input, confirmed: true }).success).toBe(true);
  const f = await fixture();
  try {
    const fresh = await savePublishing(f.db, { ...f.batch.draft, contentId: null });
    await expect(enqueuePublishingUpload(f.db, fresh.id, { ...input, confirmed: true })).rejects.toThrow(
      '发布材料已变化',
    );
    const materials = publishMaterialKey(fresh.draft, publishingData(f.db), f.config);
    await expect(enqueuePublishingUpload(f.db, fresh.id, { ...input, confirmed: true, materials })).rejects.toThrow(
      '平台与当前保存',
    );
    expect(readPublishingTask(f.db, fresh.id)).toBeNull();
    expect(f.db.db.select().from(publishRecords).where(eq(publishRecords.id, fresh.id)).get()?.state).toBe('draft');
  } finally {
    await f.close();
  }
});

test.each([
  { direct: false, partial: false },
  { direct: true, partial: false },
  { direct: true, partial: true },
])('真实 worker 编排 $direct / $partial：上传停审，失败不阻断就绪平台', async ({ direct, partial }) => {
  const f = await fixture(direct);
  const clicks: string[] = [];
  try {
    let platform = (await browser.publishingBrowserConfig()).platforms[0];
    const config = await browser.publishingBrowserConfig();
    vi.mocked(browser.navigatePublishing).mockImplementation(async (_page, url) => {
      platform = config.platforms.find((p) => p.home === url)!;
    });
    vi.mocked(browser.publishingObservation).mockImplementation(async () => ({
      url: platform.home,
      snapshot: platform.uploadedText,
    }));
    vi.spyOn(CodexJudgment.prototype, 'read').mockImplementation(async (_schema, prompt) => {
      if (prompt.startsWith('识别当前')) return { name: platform.accountNames[0], id: platform.accountId };
      if (prompt.startsWith('检查当前')) return { matches: true, ready: true, reason: 'fixture' };
      return { status: 'pending_review', postId: 'fixture-' + platform.id, url: null, evidence: '隔离测试审核中' };
    });
    vi.mocked(browser.publishingPageCall).mockImplementation(async (_page, script) => {
      if (script.includes('await p.click(') || script.includes("await channelsClick('button'")) {
        expect(
          f.db.db
            .select()
            .from(publishReceipts)
            .where(eq(publishReceipts.id, 'receipt-' + platform.id))
            .get()?.status,
        ).toBe('submitting');
        clicks.push(platform.id);
      }
    });
    if (partial) {
      const run = readUploadRun(f.db, f.batch.id)!;
      run.platforms[1].stage = 'upload';
      run.platforms[1].attempted = true;
      writeUploadRun(f.db, f.batch.id, run);
    }
    await runPublishingUpload(f.db, f.batch.id, f.task.token);
    expect(browser.beginVideoUpload).not.toHaveBeenCalled();
    if (!direct) {
      expect(clicks).toEqual([]);
      expect(readPublishingTask(f.db, f.batch.id)?.status).toBe('ready');
      expect(pausePublishingBrowser).toHaveBeenCalledTimes(1);
      expect(closePublishingBrowser).not.toHaveBeenCalled();
    } else if (partial) {
      expect(clicks).toEqual(['douyin']);
      expect(readPublishingTask(f.db, f.batch.id)).toMatchObject({
        status: 'attention',
        operation: 'upload',
        browser: f.task.browser,
      });
      expect(closePublishingBrowser).not.toHaveBeenCalled();
    } else {
      expect(clicks).toEqual(['douyin', 'channels']);
      expect(readPublishingTask(f.db, f.batch.id)).toMatchObject({ status: 'completed', browser: null });
      expect(closePublishingBrowser).toHaveBeenCalledTimes(1);
      // Repeated entry after durable receipts cannot issue another submit.
      writePublishingTask(f.db, { ...f.task, status: 'running' });
      await runPublishingSubmit(f.db, f.batch.id, f.task.token);
      expect(clicks).toEqual(['douyin', 'channels']);
    }
  } finally {
    await f.close();
  }
});

test.each(['upload', 'upload-and-publish'] as const)(
  '%s 入队保存真实点击意图，重复请求不再启动进程',
  async (action) => {
    const f = await fixture();
    let id: string | null = null;
    try {
      const batch = await savePublishing(f.db, { ...f.batch.draft, contentId: null });
      id = batch.id;
      const materials = publishMaterialKey(batch.draft, publishingData(f.db), f.config);
      const input = {
        action,
        requestId: '9337310d-e3f2-4469-9ad2-c257c1918db6',
        expectedRevision: batch.revision,
        materials,
        platformIds: batch.draft.settings.map((s) => s.platformId),
        ...(action === 'upload-and-publish' ? { confirmed: true } : {}),
      };
      const launch = vi.fn(async () => {});
      await enqueuePublishingUpload(f.db, id, input, launch);
      await enqueuePublishingUpload(f.db, id, input, launch);
      expect(launch).toHaveBeenCalledTimes(1);
      const run = readUploadRun(f.db, id)!;
      if (action === 'upload') expect(run.publishAuthorization).toBeUndefined();
      else expect(run.publishAuthorization).toMatchObject({ materials });
      expect(run.platforms.map((p) => p.id)).toEqual(input.platformIds);
      expect(run.sha256).toBe('new-fixture');
    } finally {
      if (id) await rm(path.resolve('data/jobs/publishing', id), { recursive: true, force: true });
      await f.close();
    }
  },
);
