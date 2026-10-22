import { test, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { initializeDatabase, openDatabase } from '../db/database';
import { startTopicGeneration } from './topic-generation';
import { latestTopicTask, saveTaskProgress } from './topic-task-state';
import { topicGenerationTasks } from '../db/schema';

test('并发点击只启动一次，重新打开数据库仍能看到任务；失活不自动重花token', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topic-job-fixture-'));
  const filename = path.join(folder, 'workspace.db');
  const db = await initializeDatabase(filename);
  try {
    const launch = vi.fn(async () => process.pid);
    const results = await Promise.all([startTopicGeneration(db, launch), startTopicGeneration(db, launch)]);
    expect(launch).toHaveBeenCalledOnce();
    expect(results.filter((r) => r.started)).toHaveLength(1);
    const reopened = openDatabase(filename);
    try {
      const task = latestTopicTask(reopened)!;
      expect(task.status).toBe('queued');
      expect((await startTopicGeneration(reopened, launch)).started).toBe(false);
      expect(launch).toHaveBeenCalledOnce();
      saveTaskProgress(reopened, task.id, { pid: 2147483647, stage: 'collecting' });
      reopened.db.update(topicGenerationTasks).set({ status: 'running' }).run();
      expect(latestTopicTask(reopened)).toMatchObject({ status: 'failed', reason: expect.stringContaining('中断') });
      expect(launch).toHaveBeenCalledOnce();
    } finally {
      reopened.sqlite.close();
    }
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('进程无法启动时明确记失败，下一次允许手动重试', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topic-launch-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    await expect(
      startTopicGeneration(db, async () => {
        throw Error('fixture spawn failed');
      }),
    ).rejects.toThrow();
    expect(latestTopicTask(db)).toMatchObject({ status: 'failed', reason: expect.stringContaining('启动失败') });
    expect((await startTopicGeneration(db, async () => process.pid)).started).toBe(true);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

import { spawn } from 'node:child_process';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
test('真实后台入口在请求连接关闭后继续运行，隔离无材料任务明确结束且不调用AI', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topic-worker-fixture-'));
  const filename = path.join(folder, 'workspace.db');
  const db = await initializeDatabase(filename);
  const now = new Date().toISOString();
  db.db
    .insert(topicGenerationTasks)
    .values({ id: 'fixture-worker', status: 'queued', createdAt: now, updatedAt: now })
    .run();
  db.sqlite.close();
  try {
    await mkdir(path.join(folder, 'config'));
    for (const name of ['parameters.yaml', 'platforms.yaml', 'metrics.yaml'])
      await copyFile(path.resolve('config', name), path.join(folder, 'config', name));
    await writeFile(path.join(folder, 'config/选题输入渠道.md'), '# fixture\n```yaml\nchannels: []\n```');
    const child = spawn(
      process.execPath,
      ['--experimental-strip-types', path.resolve('scripts/generate-topics.mjs'), 'fixture-worker', filename],
      { cwd: folder, detached: true, stdio: 'ignore' },
    );
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', resolve);
    });
    expect(code).toBe(1);
    const reopened = openDatabase(filename);
    try {
      expect(latestTopicTask(reopened)).toMatchObject({
        status: 'failed',
        reason: expect.stringContaining('没有获得可用线索'),
        sourceCount: 0,
      });
    } finally {
      reopened.sqlite.close();
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
