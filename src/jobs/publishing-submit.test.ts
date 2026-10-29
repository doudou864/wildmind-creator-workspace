import { test, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { savePublishing } from '../lib/publishing-store';
import { newPublishDraft } from '../lib/publishing-model';
import { registerPublishingTask } from './publishing-tasks';
import { writeUploadRun } from './publishing-upload-state';
import { writeState } from '../collectors/state';
import { publishReceipts } from '../db/schema';
import * as browser from '../browser/publishing-runner';
import { CodexJudgment } from '../ai/structured';
import { runPublishingSubmit, enqueuePublishingSubmit } from './publishing-submit';
vi.mock('../browser/publishing-runner', async (importOriginal) => {
  const original = await importOriginal<typeof import('../browser/publishing-runner')>();
  return {
    ...original,
    navigatePublishing: vi.fn(),
    waitPublishingAccount: vi.fn(),
    publishingObservation: vi.fn(),
    publishingPageCall: vi.fn(),
    screenshotPublishing: vi.fn(),
  };
});
afterEach(() => vi.restoreAllMocks());
test.each([
  ['bilibili', false],
  ['channels', false],
  ['bilibili', true],
] as const)('%s 恢复遗留 submitting 只核对结果，绝不再次点击发布（过渡态 %s）', async (platformId, transitional) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'publishing-submit-fixture-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    const batch = await savePublishing(db, {
      ...newPublishDraft('video'),
      commonCopy: { title: '隔离测试', description: '', tags: [] },
      videoInput: { topicId: null, path: '/fixture/video.mp4', covers: {} },
    });
    const task = registerPublishingTask(db, batch.id, {
      process: { pid: process.pid, command: 'fixture', startedAt: 'fixture' },
      browser: { spaceId: 999, name: 'fixture' },
    });
    writeUploadRun(db, batch.id, {
      requestId: 'fixture',
      video: '/fixture/video.mp4',
      sha256: 'fixture',
      covers: {},
      platforms: [
        {
          id: platformId,
          page: 'p2',
          stage: 'ready',
          attempted: false,
          copyPrepared: true,
          accountVerified: true,
          copy: { title: '隔离测试', description: '', tags: [] },
          reason: null,
        },
      ],
    });
    db.db
      .insert(publishReceipts)
      .values({
        id: 'fixture-receipt',
        batchId: batch.id,
        platformId,
        status: 'submitting',
        title: '隔离测试',
        safeToRetry: false,
        updatedAt: new Date().toISOString(),
      })
      .run();
    writeState(db, 'publishing-approval:' + batch.id, {
      requestId: 'fixture',
      receiptIds: ['fixture-receipt'],
      approvedAt: new Date().toISOString(),
      materials: 'fixture',
    });
    const waitForFunction = vi.fn();
    vi.mocked(browser.publishingPageCall).mockImplementation(async (_page, script) => {
      return new Function('p', 'console', `return (async()=>{${script}})()`)({ waitForFunction }, { log: () => {} });
    });
    vi.mocked(browser.publishingObservation).mockResolvedValue({ url: 'https://example.test', snapshot: '无法核验' });
    if (transitional) {
      const config = await browser.publishingBrowserConfig();
      vi.spyOn(browser, 'publishingBrowserConfig').mockResolvedValue({ ...config, pollMs: 1 });
      vi.mocked(browser.publishingObservation)
        .mockResolvedValueOnce({ url: 'https://example.test', snapshot: '提交中...' })
        .mockResolvedValue({ url: 'https://example.test', snapshot: '稿件投递成功' });
    }
    const judge = vi.spyOn(CodexJudgment.prototype, 'read').mockResolvedValue({
      status: transitional ? 'published' : 'unknown',
      postId: null,
      url: null,
      evidence: '隔离测试：未找到可核验回执',
    });
    vi.mocked(browser.publishingObservation).mockClear();
    await runPublishingSubmit(db, batch.id, task.token);
    if (transitional) {
      expect(browser.publishingObservation).toHaveBeenCalledTimes(2);
      expect(judge.mock.calls[0][1]).toContain('稿件投递成功');
      expect(judge.mock.calls[0][1]).not.toContain('提交中');
    }
    if (platformId === 'channels') expect(waitForFunction).toHaveBeenCalledTimes(1);
    else expect(browser.publishingPageCall).not.toHaveBeenCalled();
    expect(db.db.select().from(publishReceipts).get()).toMatchObject({
      status: transitional ? 'published' : 'unknown',
      safeToRetry: false,
      reason: '隔离测试：未找到可核验回执',
    });
    await expect(enqueuePublishingSubmit(db, batch.id, { action: 'upload' })).rejects.toThrow();
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
