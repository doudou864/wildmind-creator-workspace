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
test.each(['bilibili', 'channels'])('%s 恢复遗留 submitting 只核对结果，绝不再次点击发布', async (platformId) => {
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
    vi.mocked(browser.publishingObservation).mockResolvedValue({ url: 'https://example.test', snapshot: '无法核验' });
    vi.spyOn(CodexJudgment.prototype, 'read').mockResolvedValue({
      status: 'unknown',
      postId: null,
      url: null,
      evidence: '隔离测试：未找到可核验回执',
    });
    await runPublishingSubmit(db, batch.id, task.token);
    expect(browser.publishingPageCall).not.toHaveBeenCalled();
    expect(db.db.select().from(publishReceipts).get()).toMatchObject({ status: 'unknown', safeToRetry: false });
    await expect(enqueuePublishingSubmit(db, batch.id, { action: 'upload' })).rejects.toThrow();
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
