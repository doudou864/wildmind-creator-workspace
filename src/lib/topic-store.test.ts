import { readTopicSources } from '../browser/topic-source';
vi.mock('../browser/topic-source', () => ({ readTopicSources: vi.fn(async () => []) }));
import { expect, test, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { topicSources, fireEvidence, generateTopics, decideTopic } from './topic-store';
import { loadConfig } from './config';
import { loadTopicChannels, editTopicChannel } from './topic-channels';
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

test('面板保存的渠道经重新读取进入生成链路，候选保留该渠道与原文链接', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topics-external-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig();
    const sourceFile = path.join(folder, 'channels.md');
    await writeFile(sourceFile, '# fixture\n```yaml\nchannels: []\n```');
    const empty = await loadTopicChannels(sourceFile);
    await editTopicChannel(
      { action: 'add', revision: empty.revision, title: '自选来源', link: 'https://example.com/source' },
      sourceFile,
      path.join(folder, 'backups'),
    );
    const saved = await loadTopicChannels(sourceFile);
    const channel = saved.channels[0];
    vi.mocked(readTopicSources).mockResolvedValueOnce([
      {
        id: channel.id,
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
    await generateTopics(db, judge, { config, ...saved });
    expect(readTopicSources).toHaveBeenLastCalledWith(
      [channel],
      config.parameters.topicExternalMaxScreens,
      expect.objectContaining({ onPage: expect.any(Function) }),
    );
    expect(db.db.select().from(topics).all()).toHaveLength(20);
    expect(
      db.db
        .select()
        .from(topics)
        .all()
        .every((t) => t.channelId === channel.id && t.sourceUrl === channel.location),
    ).toBe(true);
    expect(topicSources(db.db.select().from(topicSignals).all(), [{ ...channel, enabled: false }])).toEqual([]);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

// All generated candidates and source records below live only in a temporary fixture database.
import { latestTopicTask } from '../jobs/topic-task-state';
const fixtureItem = (i: number) => ({
  title: `fixture 方向${i}`,
  direction: '依据已核对原文',
  source: '0',
  exploration: false,
  explorationReason: '',
  similar: [],
  recommendFire: false,
});

test('登录/网络失败不浪费成功来源，少量有效候选仍保存并留下逐站原因', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topic-partial-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig();
    const base = (await loadTopicChannels()).channels.find((c) => c.kind === 'external')!;
    const channels = ['login', 'network', 'good'].map((id) => ({
      ...base,
      id,
      name: id,
      enabled: true,
      location: `https://example.com/${id}`,
    }));
    vi.mocked(readTopicSources).mockImplementationOnce(async (_channels, _max, hooks) => {
      const pages = channels.map((c) => ({
        id: c.id,
        url: c.location,
        text: c.id === 'good' ? 'fixture 公开原文' : '',
        screenshots: [path.resolve('data/topics/fixture.png')],
        error: c.id === 'login' ? '需要登录' : c.id === 'network' ? '网络连接失败' : null,
      }));
      for (const page of pages) {
        hooks?.onStart?.(page.id);
        await hooks?.onPage?.(page);
      }
      return pages;
    });
    const read = vi
      .fn()
      .mockResolvedValueOnce({ items: [{ text: 'fixture需求', quote: '公开原文' }] })
      .mockResolvedValueOnce({ items: [fixtureItem(0)] });
    const result = await generateTopics(db, { read } as unknown as Judgment, { config, channels, document: 'fixture' });
    expect(result.count).toBe(1);
    expect(read).toHaveBeenCalledTimes(2); // Failed websites do not consume extraction calls.
    expect(db.db.select().from(topics).get()?.channelId).toBe('good');
    expect(latestTopicTask(db)).toMatchObject({
      status: 'completed',
      count: 1,
      cachedCount: 0,
      sources: [
        { status: 'failed', reason: '需要登录' },
        { status: 'failed', reason: '网络连接失败' },
        { status: 'completed', count: 1 },
      ],
    });
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('全站失败时无材料不调用AI；有已存线索可回退且明确标注', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topic-cache-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig();
    const channel = { ...(await loadTopicChannels()).channels.find((c) => c.kind === 'external')!, enabled: true };
    const options = { config, channels: [channel], document: 'fixture' };
    const pages = [{ id: channel.id, url: channel.location, text: '', screenshots: [], error: '需要登录' }];
    vi.mocked(readTopicSources).mockResolvedValueOnce(pages);
    const read = vi.fn().mockResolvedValue({ items: [fixtureItem(0)] });
    await expect(generateTopics(db, { read } as unknown as Judgment, options)).rejects.toThrow('没有获得可用线索');
    expect(read).not.toHaveBeenCalled();
    db.db
      .insert(topicSignals)
      .values({
        id: 'fixture',
        sourceType: channel.id,
        text: '此前保存的fixture线索',
        capturedAt: '2026-10-20T00:00:00.000Z',
        updatedAt: '2026-10-20T00:00:00.000Z',
      })
      .run();
    vi.mocked(readTopicSources).mockResolvedValueOnce(pages);
    await generateTopics(db, { read } as unknown as Judgment, options);
    expect(latestTopicTask(db)).toMatchObject({ status: 'completed', cachedCount: 1, count: 1 });
    expect(read).toHaveBeenCalledOnce();
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
