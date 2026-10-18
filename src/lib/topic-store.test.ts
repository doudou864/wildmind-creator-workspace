import { readTopicSources } from '../browser/topic-source';
vi.mock('../browser/topic-source', () => ({ readTopicSources: vi.fn(async () => []) }));
import { expect, test, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { topicSources, fireEvidence, generateTopics, decideTopic } from './topic-store';
import { loadConfig } from './config';
import { loadTopicChannels } from './topic-channels';
import { topics, topicSignals, topicGenerationTasks } from '../db/schema';
import type { Judgment } from '../ai/structured';
test('只用已启用渠道，重复采集同一词不重复算需求；未同步消息不是输入', async () => {
  const { channels } = await loadTopicChannels();
  const row = {
    id: 's',
    sourceType: 'search',
    text: '需求',
    share: 29,
    postId: null,
    sourceUrl: null,
    sourceMessageId: null,
    sourceThemeId: null,
    capturedAt: '2026-10-18',
    updatedAt: '2026-10-18',
  };
  expect(topicSources([row, { ...row, id: 's2', capturedAt: '2026-10-17' }], channels)).toHaveLength(1);
  expect(
    topicSources(
      [row],
      channels.map((c) => ({ ...c, enabled: false })),
    ),
  ).toHaveLength(0);
  expect(topicSources([{ ...row, sourceType: 'unknown' }], channels)).toHaveLength(0);
});
test('FIRE不足20不开；满20后平均倍数由代码计算，不能伪造作品', () => {
  const h = [
    { id: 'a', title: 'A', d21: 2, trend: '长尾型' },
    { id: 'b', title: 'B', d21: 3, trend: '爆发型' },
  ];
  expect(fireEvidence(h, ['a', 'b'], 19, 20)).toBeNull();
  expect(fireEvidence(h, ['a', 'b'], 20, 20)).toMatchObject({ count: 2, d21: 2.5, trend: '长尾型、爆发型' });
  expect(() => fireEvidence(h, ['absent'], 20, 20)).toThrow();
  expect(() => fireEvidence(h, ['a', 'a'], 20, 20)).toThrow();
});
test('20候选原子保存、首选非FIRE定格，失败批次不留半批候选或改旧选择', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topics-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig(),
      sources = await loadTopicChannels(),
      options = { config, ...sources };
    db.db
      .insert(topicSignals)
      .values({
        id: 's',
        sourceType: 'search',
        text: '真实搜索词',
        capturedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .run();
    const items = Array.from({ length: 20 }, (_, i) => ({
      title: `方向${i}`,
      direction: '具体问题和实测切入点。',
      source: '0',
      exploration: i < 2,
      explorationReason: '热度未验证',
      similar: [],
      recommendFire: false,
    }));
    const judge = { read: async () => ({ items }) } as unknown as Judgment;
    expect(await generateTopics(db, judge, options)).toMatchObject({ count: 20 });
    const row = db.db.select().from(topics).get()!;
    const selected = decideTopic(db, row.id, 'selected', config);
    expect(selected.frozenFire).toBe(false);
    expect(selected.selectedAt).not.toBeNull();
    decideTopic(db, row.id, 'skipped', config);
    expect(decideTopic(db, row.id, 'selected', config).selectedAt).toBe(selected.selectedAt);
    items[19].source = '999';
    await expect(generateTopics(db, judge, options)).rejects.toThrow('不存在');
    expect(db.db.select().from(topics).all()).toHaveLength(20);
    expect(
      db.db
        .select()
        .from(topicGenerationTasks)
        .all()
        .map((t) => t.status),
    ).toEqual(['completed', 'failed']);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('新增外部渠道只改文档，读取的原文必须可核对，渠道关闭不打开浏览器', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topics-external-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig();
    const channel = {
      id: 'custom',
      name: '自选来源',
      kind: 'external' as const,
      enabled: true,
      type: '网站',
      location: 'https://example.com/source',
      focus: '创作',
      frequency: '每次生成',
      note: '',
    };
    vi.mocked(readTopicSources).mockResolvedValueOnce([
      {
        id: 'custom',
        url: channel.location,
        text: '原文可核对的创作需求',
        screenshots: [path.resolve('data/topics/test/0.png')],
        error: null,
      },
    ]);
    let call = 0;
    const judge = {
      read: async () =>
        ++call === 1
          ? { items: [{ text: '创作需求', quote: '可核对的创作需求' }] }
          : {
              items: Array.from({ length: 20 }, (_, i) => ({
                title: `外部方向${i}`,
                direction: '依据原文具体需求',
                source: '0',
                exploration: i < 2,
                explorationReason: '热度未验证',
                similar: [],
                recommendFire: false,
              })),
            },
    } as unknown as Judgment;
    await generateTopics(db, judge, { config, channels: [channel], document: '测试自定义渠道' });
    expect(readTopicSources).toHaveBeenLastCalledWith([channel], config.parameters.topicExternalMaxScreens);
    expect(
      db.db
        .select()
        .from(topics)
        .all()
        .every((t) => t.channelId === 'custom' && t.sourceUrl === channel.location),
    ).toBe(true);
    expect(topicSources(db.db.select().from(topicSignals).all(), [{ ...channel, enabled: false }])).toEqual([]);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
