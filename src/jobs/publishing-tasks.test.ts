import { test, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { initializeDatabase } from '../db/database';
import { publishRecords, publishReceipts } from '../db/schema';
import { newPublishDraft } from '../lib/publishing-model';
import { savePublishing } from '../lib/publishing-store';
import {
  registerPublishingTask,
  controlPublishingTask,
  readPublishingTask,
  publishingCheckpoint,
  writePublishingTask,
} from './publishing-tasks';
import { readUploadRun, writeUploadRun } from './publishing-upload-state';
import { writeState } from '../collectors/state';

async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), 'publishing-tasks-fixture-'));
  const db = await initializeDatabase(path.join(directory, 'workspace.db'));
  const batches = [];
  for (let i = 0; i < 4; i++)
    batches.push(
      await savePublishing(db, {
        ...newPublishDraft('video'),
        commonCopy: { title: `隔离测试 ${i}`, description: '', tags: [] },
        videoInput: { topicId: null, path: '/fixture/video.mp4', covers: {} },
      }),
    );
  return {
    db,
    batches,
    async close() {
      db.sqlite.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

async function interruptedFixture() {
  const f = await fixture(),
    batch = f.batches[0];
  const task = registerPublishingTask(f.db, batch.id, {
    process: null,
    browser: { spaceId: 34, name: 'fixture-closed-space' },
  });
  writePublishingTask(f.db, {
    ...task,
    status: 'interrupted',
    operation: 'upload',
    browserName: 'fixture-closed-space',
  });
  writeUploadRun(f.db, batch.id, {
    requestId: 'fixture-request',
    video: '/fixture/video.mp4',
    sha256: 'fixture-sha',
    covers: { '16:9': '/fixture/cover.png' },
    platforms: [
      {
        id: 'xiaohongshu',
        page: 'p3',
        stage: 'copy',
        attempted: false,
        accountVerified: true,
        copyPrepared: true,
        copy: { title: 'fixture', description: '', tags: [] },
        reason: 'old failure',
      },
    ],
  });
  f.db.db
    .insert(publishReceipts)
    .values({
      id: 'fixture-receipt',
      batchId: batch.id,
      platformId: 'xiaohongshu',
      status: 'unknown',
      title: 'fixture',
      safeToRetry: false,
      uploadedAt: new Date().toISOString(),
      materials: 'old-materials',
      updatedAt: new Date().toISOString(),
    })
    .run();
  return { ...f, batch, task };
}

test('丢失浏览器后重建原上传任务，保留材料，旧审核失效且迟到进程不能写回', async () => {
  const f = await interruptedFixture(),
    launch = vi.fn(async () => {});
  try {
    const before = readUploadRun(f.db, f.batch.id)!;
    await controlPublishingTask(
      f.db,
      f.batch.id,
      { action: 'rebuild-upload', expectedRevision: 0 },
      {
        stop: async () => {},
        close: async () => {},
        inspectBrowser: async () => null,
        resume: launch,
      },
    );
    const current = readPublishingTask(f.db, f.batch.id)!;
    expect(current).toMatchObject({ status: 'running', browser: null, process: null });
    expect(current.browserName).toBeUndefined();
    expect(current.token).not.toBe(f.task.token);
    expect(readUploadRun(f.db, f.batch.id)).toMatchObject({
      video: before.video,
      sha256: before.sha256,
      covers: before.covers,
      platforms: [{ page: null, stage: 'account', attempted: false, accountVerified: false, reason: null }],
    });
    expect(readUploadRun(f.db, f.batch.id)?.publishAuthorization).toBeUndefined();
    expect(f.db.db.select().from(publishReceipts).get()).toMatchObject({
      status: 'uploading',
      uploadedAt: null,
      materials: null,
      revision: 1,
    });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(publishingCheckpoint(f.db, f.batch.id, f.task.token, 'late')).toBe(false);
    await expect(
      controlPublishingTask(
        f.db,
        f.batch.id,
        { action: 'rebuild-upload', expectedRevision: 0 },
        {
          stop: async () => {},
          close: async () => {},
          resume: launch,
        },
      ),
    ).rejects.toThrow('任务已更新');
    expect(launch).toHaveBeenCalledTimes(1);
  } finally {
    await f.close();
  }
});

test.each(['user', 'agent'])('原浏览器仍存在（%s）不得重建或丢弃已有上传', async (ownership) => {
  const f = await interruptedFixture(),
    launch = vi.fn(async () => {});
  try {
    const before = readUploadRun(f.db, f.batch.id);
    await expect(
      controlPublishingTask(
        f.db,
        f.batch.id,
        { action: 'rebuild-upload', expectedRevision: 0 },
        {
          stop: async () => {},
          close: async () => {},
          resume: launch,
          inspectBrowser: async () => ({ ownership }),
        },
      ),
    ).rejects.toThrow('原浏览器仍在');
    expect(readUploadRun(f.db, f.batch.id)).toEqual(before);
    expect(launch).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

test.each(['submitting', 'pending_review', 'published', 'approval', 'publish-failure'])(
  '存在提交证据 %s 时不能用重建绕过重复发布保护',
  async (evidence) => {
    const f = await interruptedFixture(),
      launch = vi.fn(async () => {});
    try {
      if (evidence === 'approval') writeState(f.db, 'publishing-approval:' + f.batch.id, { requestId: 'fixture' });
      else
        f.db.db
          .update(publishReceipts)
          .set(
            evidence === 'publish-failure'
              ? { failureStage: 'publish' }
              : {
                  status: evidence as 'submitting' | 'pending_review' | 'published',
                },
          )
          .run();
      const before = readUploadRun(f.db, f.batch.id);
      await expect(
        controlPublishingTask(
          f.db,
          f.batch.id,
          { action: 'rebuild-upload', expectedRevision: 0 },
          {
            stop: async () => {},
            close: async () => {},
            resume: launch,
            inspectBrowser: async () => null,
          },
        ),
      ).rejects.toThrow(/提交/);
      expect(readUploadRun(f.db, f.batch.id)).toEqual(before);
      expect(launch).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  },
);

test('手动继续先接回原浏览器，再启动进程；页面和上传检查点保持', async () => {
  const f = await interruptedFixture(),
    calls: string[] = [];
  try {
    const before = readUploadRun(f.db, f.batch.id);
    await controlPublishingTask(
      f.db,
      f.batch.id,
      { action: 'resume', expectedRevision: 0 },
      {
        stop: async () => {},
        close: async () => {},
        continueBrowser: async (b) => {
          expect(b.spaceId).toBe(34);
          calls.push('browser');
        },
        resume: async () => {
          calls.push('worker');
        },
      },
    );
    expect(calls).toEqual(['browser', 'worker']);
    expect(readUploadRun(f.db, f.batch.id)).toEqual(before);
    expect(readPublishingTask(f.db, f.batch.id)?.browser?.pausedByTask).toBe(false);
  } finally {
    await f.close();
  }
});

test('继续时发现原浏览器丢失，保留可恢复状态并显示重建出口，不启动无效进程', async () => {
  const f = await interruptedFixture(),
    launch = vi.fn(async () => {});
  try {
    await expect(
      controlPublishingTask(
        f.db,
        f.batch.id,
        { action: 'resume', expectedRevision: 0 },
        {
          stop: async () => {},
          close: async () => {},
          resume: launch,
          continueBrowser: async () => {
            throw Error('原浏览器已关闭，请点击重建浏览器并继续上传');
          },
        },
      ),
    ).rejects.toThrow('重建浏览器');
    expect(launch).not.toHaveBeenCalled();
    expect(readPublishingTask(f.db, f.batch.id)).toMatchObject({
      status: 'interrupted',
      reason: expect.stringContaining('重建浏览器'),
    });
    expect(readUploadRun(f.db, f.batch.id)?.platforms[0].stage).toBe('copy');
  } finally {
    await f.close();
  }
});

test('重建保留本人原来的直接发布授权，不把普通上传升级成发布', async () => {
  const f = await interruptedFixture();
  try {
    const authorization = { approvedAt: new Date().toISOString(), materials: 'fixture-materials' };
    writeUploadRun(f.db, f.batch.id, { ...readUploadRun(f.db, f.batch.id)!, publishAuthorization: authorization });
    await controlPublishingTask(
      f.db,
      f.batch.id,
      { action: 'rebuild-upload', expectedRevision: 0 },
      {
        stop: async () => {},
        close: async () => {},
        inspectBrowser: async () => null,
        resume: async () => {},
      },
    );
    expect(readUploadRun(f.db, f.batch.id)?.publishAuthorization).toEqual(authorization);
  } finally {
    await f.close();
  }
});

test('四条上传各自运行，暂停一条只停自己的进程，保留浏览器与检查点', async () => {
  const f = await fixture();
  const stopped: string[] = [];
  try {
    for (const b of f.batches)
      registerPublishingTask(f.db, b.id, { process: null, browser: { spaceId: f.batches.indexOf(b) + 1, name: b.id } });
    const first = f.batches[0],
      task = readPublishingTask(f.db, first.id)!;
    publishingCheckpoint(f.db, first.id, task.token, '抖音视频已上传');
    await controlPublishingTask(
      f.db,
      first.id,
      { action: 'pause', expectedRevision: 0 },
      {
        stop: async (t) => {
          expect(readPublishingTask(f.db, t.batchId)?.status).toBe('pausing');
          stopped.push(t.batchId);
        },
        close: async () => {
          throw Error('暂停不得关闭浏览器');
        },
      },
    );
    expect(stopped).toEqual([first.id]);
    expect(readPublishingTask(f.db, first.id)).toMatchObject({
      status: 'paused',
      checkpoint: '抖音视频已上传',
      browser: { spaceId: 1 },
    });
    for (const b of f.batches.slice(1)) expect(readPublishingTask(f.db, b.id)?.status).toBe('running');
    expect(publishingCheckpoint(f.db, first.id, task.token, '不应该继续的写入')).toBe(false);
    await expect(savePublishing(f.db, first.draft, first.id, 1)).rejects.toThrow('上传流程');
    await controlPublishingTask(
      f.db,
      first.id,
      { action: 'resume', expectedRevision: 1 },
      { stop: async () => {}, close: async () => {}, resume: async () => {} },
    );
    expect(readPublishingTask(f.db, first.id)?.status).toBe('running');
    expect(readPublishingTask(f.db, first.id)?.token).not.toBe(task.token);
    expect(publishingCheckpoint(f.db, first.id, task.token, '旧进程迟到结果')).toBe(false);
  } finally {
    await f.close();
  }
});
test('删除先停止进程再关自己的浏览器，失败可重试且不伪报已删除；未知提交不重试', async () => {
  const f = await fixture();
  const calls: string[] = [];
  try {
    const b = f.batches[0];
    registerPublishingTask(f.db, b.id, { process: null, browser: { spaceId: 99, name: b.id } });
    f.db.db
      .insert(publishReceipts)
      .values({
        id: 'fixture-receipt',
        batchId: b.id,
        platformId: 'douyin',
        status: 'uploading',
        title: b.draft.commonCopy.title,
        safeToRetry: false,
        updatedAt: new Date().toISOString(),
      })
      .run();
    await expect(
      controlPublishingTask(
        f.db,
        b.id,
        { action: 'delete', expectedRevision: 0 },
        {
          stop: async () => {
            calls.push('stop');
          },
          close: async () => {
            calls.push('close');
            throw Error('浏览器清理失败');
          },
        },
      ),
    ).rejects.toThrow('浏览器清理失败');
    expect(readPublishingTask(f.db, b.id)?.status).toBe('cleanup_failed');
    expect(f.db.db.select().from(publishRecords).where(eq(publishRecords.id, b.id)).get()?.abandonedAt).toBeNull();
    await controlPublishingTask(
      f.db,
      b.id,
      { action: 'delete', expectedRevision: 1 },
      {
        stop: async () => {
          calls.push('stop');
        },
        close: async (browser) => {
          expect(browser.spaceId).toBe(99);
          calls.push('close');
        },
      },
    );
    expect(calls).toEqual(['stop', 'close', 'stop', 'close']);
    expect(readPublishingTask(f.db, b.id)?.status).toBe('deleted');
    expect(f.db.db.select().from(publishReceipts).get()).toMatchObject({ status: 'unknown', safeToRetry: false });
    expect(
      f.db.db.select().from(publishRecords).where(eq(publishRecords.id, f.batches[1].id)).get()?.abandonedAt,
    ).toBeNull();
    await expect(savePublishing(f.db, b.draft, b.id, 2)).rejects.toThrow();
  } finally {
    await f.close();
  }
});

test('暂停只停止登记的独立进程组，身份不符时拒绝发送信号', async () => {
  const { spawn } = await import('node:child_process');
  const { inspectPublishingProcess, stopPublishingProcess } = await import('./publishing-tasks');
  const token = 'publishing-process-fixture-' + Date.now();
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', token], { detached: true, stdio: 'ignore' });
  await new Promise<void>((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
  try {
    const identity = (await inspectPublishingProcess(child.pid!))!;
    const task = {
      batchId: 'fixture',
      token,
      process: identity,
      browser: null,
      status: 'running' as const,
      checkpoint: 'fixture',
      reason: null,
      updatedAt: new Date().toISOString(),
    };
    await expect(stopPublishingProcess({ ...task, process: { ...identity, command: 'unrelated' } })).rejects.toThrow(
      '身份已变化',
    );
    expect(await inspectPublishingProcess(child.pid!)).not.toBeNull();
    await stopPublishingProcess(task);
    expect(await inspectPublishingProcess(child.pid!)).toBeNull();
  } finally {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {}
  }
});
