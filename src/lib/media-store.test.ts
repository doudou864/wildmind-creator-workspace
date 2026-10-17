import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { generateAssets, usedImages } from './media-store';
import { imageGenerations, assets } from '../db/schema';
import { shanghaiDate } from '../browser/policy';
const draft = {
  uploadPurposeId: '',
  title: '测试',
  purposeId: 'free',
  styleId: 'default',
  prompt: '茶壶',
  content: '',
  ratio: '3:4',
  topicId: null,
  contentId: null,
  existingAssets: {},
  parentAssetId: null,
  editInstruction: '',
};
test('达到每日额度不调用模型；超时计一次尝试且没有半成品素材', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'images-')),
    db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    let calls = 0;
    const failure = async () => {
      calls++;
      throw new Error('timeout');
    };
    await expect(generateAssets(db, draft, failure)).rejects.toThrow('超时');
    expect(calls).toBe(1);
    expect(usedImages(db, shanghaiDate())).toBe(1);
    expect(db.db.select().from(assets).all()).toHaveLength(0);
    const run = db.db.select().from(imageGenerations).get()!;
    expect(run.status).toBe('failed');
    expect(run.durationMs).not.toBeNull();
    expect(run.reason).toContain('超时');
    db.db
      .insert(imageGenerations)
      .values({
        id: 'limit',
        kind: 'generate',
        usageDate: shanghaiDate(),
        status: 'success',
        startedAt: new Date().toISOString(),
        calls: 100,
      })
      .run();
    await expect(generateAssets(db, draft, failure)).rejects.toThrow('每日上限');
    expect(calls).toBe(1);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
test('同一时间第二次生成被拒绝，不并发消耗套餐', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'serial-images-')),
    db = await initializeDatabase(path.join(folder, 'workspace.db'));
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  const blocked = new Promise<void>((r) => (finish = r));
  try {
    const first = generateAssets(db, draft, async () => {
      entered();
      await blocked;
      throw new Error('测试停止');
    });
    const firstResult = expect(first).rejects.toThrow('测试停止');
    await started;
    await expect(
      generateAssets(db, draft, async () => {
        throw new Error('不应调用');
      }),
    ).rejects.toThrow('已有图片');
    finish();
    await firstResult;
    expect(usedImages(db, shanghaiDate())).toBe(1);
  } finally {
    finish?.();
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
