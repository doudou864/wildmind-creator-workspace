import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { initializeDatabase } from '../db/database';
import { imageTasks, imageGenerations } from '../db/schema';
import { reserveImageTask, readImageTasks } from './image-tasks';
const input = {
  title: '后台测试',
  purposeId: 'free',
  uploadPurposeId: '',
  styleId: 'default',
  prompt: '茶杯',
  content: '',
  ratio: '3:4',
  topicId: null,
  contentId: null,
  existingAssets: {},
  parentAssetId: null,
  editInstruction: '',
};
test('刷新查询和重复提交接回同一任务，完成后的相同编号也不重复计次', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'image-task-')),
    db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const id = randomUUID();
    expect(reserveImageTask(db, id, input).created).toBe(true);
    expect(reserveImageTask(db, id, input).created).toBe(false);
    expect(reserveImageTask(db, randomUUID(), input).task.id).toBe(id);
    expect(() => reserveImageTask(db, randomUUID(), { ...input, prompt: '另一张' })).toThrow('已有后台');
    expect(readImageTasks(db)).toHaveLength(1);
    db.db.update(imageTasks).set({ status: 'success' }).where(eq(imageTasks.id, id)).run();
    expect(reserveImageTask(db, id, input).created).toBe(false);
    expect(db.db.select().from(imageGenerations).all()).toHaveLength(0);
    db.db
      .update(imageTasks)
      .set({ status: 'queued', createdAt: '2000-01-01T00:00:00Z' })
      .where(eq(imageTasks.id, id))
      .run();
    expect(readImageTasks(db)[0]).toMatchObject({ status: 'failed', reason: expect.stringContaining('未自动重试') });
    expect(db.db.select().from(imageTasks).all()).toHaveLength(1);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
