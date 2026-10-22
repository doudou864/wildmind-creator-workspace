import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { posts, contents, postSnapshots, dataInterpretations } from '../db/schema';
import { loadConfig } from './config';
import { loadDataCenterConfig } from './data-center-config';
import { dataCenterData, worksPlaybackData, generateInterpretation, composeInterpretation } from './data-center-store';
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
    const playback = worksPlaybackData(db, config, settings);
    expect(playback.days).toEqual([1, 3, 7, 30]);
    expect(playback.distributions[7]).toMatchObject({ count: 0, median: null });
    expect(playback.distributions[7].rows[0].value).toBeNull();
    expect(playback.distributions[30].count).toBe(0);
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

test('作品页统计独立读取全部抖音形式，排除外平台和fixture，切换详情不改变统计', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'works-playback-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig(),
      settings = await loadDataCenterConfig();
    const publishedAt = '2026-10-01T23:00:00+08:00';
    for (const [id, form, platformId, fixture, value] of [
      ['video', '视频', settings.platformId, false, 2000],
      ['image', '图文', settings.platformId, false, 6000],
      ['external', '视频', 'bilibili', false, 900000],
      ['hidden', '视频', settings.platformId, true, 800000],
    ] as const) {
      db.db
        .insert(contents)
        .values({ id, form, fixture, title: `隔离测试 ${id}`, videoCovers: {}, updatedAt: publishedAt })
        .run();
      db.db
        .insert(posts)
        .values({ id, contentId: id, platformId, publishedAt, title: `隔离测试 ${id}`, updatedAt: publishedAt })
        .run();
      const metric = config.metrics.find(
        (m) =>
          m.scope === 'post' &&
          m.name === settings.viewsName &&
          m.bindings.some((b) => b.platformId === settings.platformId && (b.form === form || b.form === 'all')),
      )!;
      db.db
        .insert(postSnapshots)
        .values({
          id,
          postId: id,
          metricId: metric.id,
          capturedAt: '2026-10-02T10:00:00+08:00',
          captureDate: '2026-10-02',
          dayAfterPublish: 1,
          value,
          precision: 'exact',
          backfillKind: 'none',
          updatedAt: publishedAt,
        })
        .run();
    }
    const now = new Date('2026-10-05T12:00:00+08:00');
    const before = worksPlaybackData(db, config, settings, now);
    expect(before.distributions[1]).toMatchObject({ count: 2, median: 4000, min: 1000, max: 7000 });
    expect(before.distributions[1].rows.map((r) => r.id).sort()).toEqual(['image', 'video']);
    expect(dataCenterData(db, config, settings, 'video', now).selected?.id).toBe('video');
    expect(dataCenterData(db, config, settings, 'image', now).selected?.id).toBe('image');
    expect(worksPlaybackData(db, config, settings, now)).toEqual(before);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
