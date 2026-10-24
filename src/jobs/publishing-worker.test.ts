import { test, expect, vi, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { savePublishing } from '../lib/publishing-store';
import { newPublishDraft } from '../lib/publishing-model';
import { registerPublishingTask, readPublishingTask, writePublishingTask } from './publishing-tasks';
import { writeUploadRun, readUploadRun } from './publishing-upload-state';
import * as browser from '../browser/publishing-runner';
import { CodexJudgment } from '../ai/structured';
import { runPublishingUpload } from './publishing-worker';
vi.mock('../lib/local-videos', async (original) => ({
  ...(await original<typeof import('../lib/local-videos')>()),
  fingerprint: vi.fn(async () => ({ sha256: 'fixture' })),
}));
vi.mock('../browser/publishing-task', () => ({ resumePublishingBrowser: vi.fn(), pausePublishingBrowser: vi.fn() }));
vi.mock('../browser/publishing-runner', async (importOriginal) => {
  const original = await importOriginal<typeof import('../browser/publishing-runner')>();
  return {
    ...original,
    navigatePublishing: vi.fn(),
    waitPublishingAccount: vi.fn(),
    publishingObservation: vi.fn(),
    beginVideoUpload: vi.fn(),
    fillPublishingCopy: vi.fn(),
    fillPublishingCovers: vi.fn(),
    screenshotPublishing: vi.fn(),
  };
});
afterEach(() => vi.restoreAllMocks());
async function fixture(stage: 'upload' | 'wait' | 'covers', attempted = false) {
  const dir = await mkdtemp(path.join(tmpdir(), 'publishing-worker-fixture-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
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
        id: 'bilibili',
        page: 'p2',
        stage,
        attempted,
        copyPrepared: true,
        accountVerified: false,
        copy: { title: '隔离测试', description: '', tags: [] },
        reason: null,
      },
    ],
  });
  vi.spyOn(CodexJudgment.prototype, 'read').mockResolvedValue({
    name: '摆烂的逗逗',
    id: '291051369',
    reason: '隔离测试',
  });
  vi.mocked(browser.publishingObservation).mockResolvedValue({
    url: 'https://example.test',
    snapshot: '隔离测试 上传完成',
  });
  return {
    db,
    batch,
    task,
    close: async () => {
      db.sqlite.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}
test('恢复已发送视频只核对原页面；暂停发生后不继续填写、不重新发送文件', async () => {
  const f = await fixture('wait');
  try {
    vi.mocked(browser.publishingObservation).mockImplementation(async () => {
      const t = readPublishingTask(f.db, f.batch.id)!;
      if (t.checkpoint.includes('等待平台')) writePublishingTask(f.db, { ...t, status: 'pausing' });
      return { url: 'https://example.test', snapshot: '上传完成' };
    });
    await runPublishingUpload(f.db, f.batch.id, f.task.token);
    expect(browser.beginVideoUpload).not.toHaveBeenCalled();
    expect(browser.fillPublishingCopy).not.toHaveBeenCalled();
    expect(readUploadRun(f.db, f.batch.id)?.platforms[0].stage).toBe('wait');
    expect(readPublishingTask(f.db, f.batch.id)?.status).toBe('pausing');
  } finally {
    await f.close();
  }
});
test('发送动作的回执丢失时不重复上传；保留原页面与需要核对的原因', async () => {
  const f = await fixture('upload', true);
  try {
    await runPublishingUpload(f.db, f.batch.id, f.task.token);
    expect(browser.beginVideoUpload).not.toHaveBeenCalled();
    expect(readPublishingTask(f.db, f.batch.id)?.status).toBe('attention');
    expect(readUploadRun(f.db, f.batch.id)?.platforms[0].reason).toContain('上次上传动作结果待核对');
  } finally {
    await f.close();
  }
});
test('封面编辑中断不能盲目再次打开编辑器覆盖已有结果', async () => {
  const f = await fixture('covers', true);
  try {
    await runPublishingUpload(f.db, f.batch.id, f.task.token);
    expect(browser.fillPublishingCovers).not.toHaveBeenCalled();
    expect(readUploadRun(f.db, f.batch.id)?.platforms[0].reason).toContain('封面编辑中断');
  } finally {
    await f.close();
  }
});
