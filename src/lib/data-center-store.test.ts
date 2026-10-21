import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { posts, contents, postSnapshots, dataInterpretations } from '../db/schema';
import { loadConfig } from './config';
import { loadDataCenterConfig } from './data-center-config';
import { dataCenterData, generateInterpretation, composeInterpretation } from './data-center-store';
import type { Judgment } from '../ai/structured';
import type { Comparison } from '../core/data-center';
test('打开页面只读不生成；按按钮生成后缓存；刷新不重调AI；不接受编造数字；新检查点指纹不同', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'analysis-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig(),
      settings = await loadDataCenterConfig(),
      time = '2026-10-01T10:00:00+08:00';
    const metric = config.metrics.find(
      (m) =>
        m.scope === 'post' &&
        m.name === settings.viewsName &&
        m.bindings.some((b) => b.platformId === settings.platformId && b.form === '视频'),
    )!;
    db.db.insert(contents).values({ id: 'c', form: '视频', title: '测试', videoCovers: {}, updatedAt: time }).run();
    db.db
      .insert(posts)
      .values({
        id: 'p',
        contentId: 'c',
        platformId: settings.platformId,
        publishedAt: time,
        title: '测试',
        updatedAt: time,
      })
      .run();
    db.db
      .insert(postSnapshots)
      .values({
        id: 's',
        postId: 'p',
        capturedAt: '2026-10-09T10:00:00+08:00',
        captureDate: '2026-10-09',
        dayAfterPublish: 8,
        metricId: metric.id,
        value: 100,
        precision: 'exact',
        backfillKind: 'checkpoint',
        updatedAt: time,
      })
      .run();
    let calls = 0;
    const judgment = {
      read: async (_schema: unknown, prompt: string) => {
        calls++;
        expect(prompt).toContain('"actualDay":8');
        expect(prompt).not.toContain('测试');
        return { cause: '现有样本无法支持归因', action: '保持主题并观察开头表现' };
      },
    } as unknown as Judgment;
    const data = dataCenterData(db, config, settings, 'p');
    expect(data.playbackDays).toEqual([1, 3, 7, 30]);
    expect(data.playback[7]).toMatchObject({ count: 0, median: null });
    expect(data.playback[7].rows[0].value).toBeNull();
    expect(data.playback[30].count).toBe(0);
    expect(db.db.select().from(dataInterpretations).all()).toHaveLength(0);
    const input = { day: 7, fingerprint: data.fingerprints[7] };
    const first = await generateInterpretation(db, config, settings, 'p', input, judgment);
    expect(first.paragraphs).toHaveLength(4);
    expect(first.paragraphs.join('')).toContain('D7 补抓于 D8');
    expect(first.paragraphs.join('').length).toBeLessThanOrEqual(150);
    expect((await generateInterpretation(db, config, settings, 'p', input, judgment)).id).toBe(first.id);
    expect(calls).toBe(1);
    expect(dataCenterData(db, config, settings, 'p').interpretations).toHaveLength(1);
    expect(calls).toBe(1);
    expect(data.fingerprints[3]).not.toBe(data.fingerprints[7]);
    const bad = { read: async () => ({ cause: '提升99%', action: '再发一次' }) } as unknown as Judgment;
    await expect(
      generateInterpretation(db, config, settings, 'p', { day: 3, fingerprint: data.fingerprints[3] }, bad),
    ).rejects.toThrow('数字表');
    expect(db.db.select().from(dataInterpretations).all()).toHaveLength(1);
    await expect(
      generateInterpretation(db, config, settings, 'p', { day: 7, fingerprint: 'a'.repeat(64) }, judgment),
    ).rejects.toThrow('数据已更新');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
test('全正常不硬找问题，缺失和不足均明确说明；引用的数字由表格拼接', () => {
  const row: Comparison = {
    id: 'views',
    name: '播放量',
    unit: '次',
    direction: 'higher',
    value: 20,
    median: 20,
    p25: 10,
    p75: 30,
    count: 5,
    conclusion: '正常',
    status: 'ready',
    actualDay: 7,
    capturedAt: null,
    peerBackfills: [],
  };
  const ai = { cause: '主题可能契合既有受众', action: '保持主题测试更直接的开头' };
  expect(composeInterpretation({ day: 7, minimum: 5, rows: [row] }, ai, 150)[0]).toBe('各项都在正常范围。');
  const low = { ...row, value: 5, conclusion: '偏低' as const };
  expect(composeInterpretation({ day: 7, minimum: 5, rows: [low] }, ai, 150)[1]).toContain('播放量5，中位20次');
  const missing = {
    ...row,
    value: null,
    median: null,
    p25: null,
    p75: null,
    count: 2,
    conclusion: null,
    status: 'missing' as const,
  };
  const text = composeInterpretation({ day: 7, minimum: 5, rows: [missing] }, ai, 150).join('');
  expect(text).toContain('没有数据');
  expect(text).toContain('样本不足，不下结论');
});
