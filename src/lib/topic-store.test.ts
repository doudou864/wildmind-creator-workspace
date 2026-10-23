import { readTopicSources } from '../browser/topic-source';
vi.mock('../browser/topic-source', () => ({ readTopicSources: vi.fn(async () => []) }));
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import {
  topicSources,
  fireEvidence,
  generateTopics,
  decideTopic,
  topicExtractionSchema,
  limitTopicSources,
} from './topic-store';
import { loadConfig } from './config';
import { loadTopicChannels, editTopicChannel } from './topic-channels';
import { topics, topicSignals, topicGenerationTasks, rawRecords } from '../db/schema';
import type { Judgment } from '../ai/structured';
const externalFixture = {
  id: 'fixture-site',
  name: 'fixture来源',
  kind: 'external' as const,
  enabled: true,
  type: '网页',
  location: 'https://example.com/fixture',
  focus: 'fixture',
  frequency: '',
  note: '',
};
// Fixture model follows all production stages while returning only explicitly supplied evidence.
function fixtureJudge(read: (schema: unknown, prompt: string) => Promise<any>): Judgment {
  return {
    read: async (schema: unknown, prompt: string) => {
      const input = prompt.includes('\n') ? JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) : null;
      if (prompt.startsWith('[topic:edit]'))
        return {
          items: input.drafts.map((d: any) => ({
            draftId: d.draftId,
            title: d.title,
            entityKey: d.entity,
            angleKey: d.angle,
            interest: true,
            supported: true,
            distinct: true,
            reason: 'fixture有原文且观看理由不同',
          })),
        };
      const result = await read(schema, prompt);
      if (prompt.startsWith('[topic:draft]'))
        return {
          items: result.items.map((item: any) => ({
            ...item,
            entity: item.title,
            angle: '不同观看理由 ' + item.title,
            viewerBenefit: 'fixture省时间',
            curiosity: '',
            payoff: item.direction,
            evidenceQuote: input.sources.find((s: any) => s.id === item.source)?.text ?? '无依据',
          })),
        };
      return result;
    },
  } as Judgment;
}
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

test('一篇长网页不能耗尽主动发现预算，其他实体和两个抖音需求渠道都有机会', () => {
  const rows = [
    ...Array.from({ length: 8 }, (_, i) => ({
      channelId: 'discovery',
      sourceUrl: 'https://example.com/one',
      text: `长页${i}`,
    })),
    { channelId: 'discovery', sourceUrl: 'https://example.com/two', text: '另一实体' },
    { channelId: 'search_keywords', sourceUrl: null, text: '主动搜索词' },
    { channelId: 'followup_search', sourceUrl: null, text: '看后搜' },
  ];
  expect(limitTopicSources(rows, 3).map((s) => s.text)).toEqual(['长页0', '另一实体', '长页1', '主动搜索词', '看后搜']);
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
    const judge = fixtureJudge(async () => ({ items }));
    expect(await generateTopics(db, judge, options)).toMatchObject({ count: 20 });
    const row = db.db.select().from(topics).get()!;
    const selected = decideTopic(db, row.id, 'selected', config);
    expect(selected.frozenFire).toBe(false);
    expect(selected.selectedAt).not.toBeNull();
    decideTopic(db, row.id, 'skipped', config);
    expect(decideTopic(db, row.id, 'selected', config).selectedAt).toBe(selected.selectedAt);
    items[19].source = '999';
    await expect(generateTopics(db, judge, options)).rejects.toThrow('没有通过');
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
    const judge = fixtureJudge(async () =>
      ++call === 1
        ? { items: [{ text: '创作需求', quote: '可核对的创作需求' }], reason: null }
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
    );
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
    const base = externalFixture;
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
      .mockResolvedValueOnce({ items: [{ text: 'fixture需求', quote: '公开原文' }], reason: null })
      .mockResolvedValueOnce({ items: [fixtureItem(0)] });
    const result = await generateTopics(db, fixtureJudge(read), { config, channels, document: 'fixture' });
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
    const channel = externalFixture;
    const options = { config, channels: [channel], document: 'fixture' };
    const pages = [{ id: channel.id, url: channel.location, text: '', screenshots: [], error: '需要登录' }];
    vi.mocked(readTopicSources).mockResolvedValueOnce(pages);
    const read = vi.fn().mockResolvedValue({ items: [fixtureItem(0)] });
    await expect(generateTopics(db, fixtureJudge(read), options)).rejects.toThrow('没有获得可用线索');
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
    await generateTopics(db, fixtureJudge(read), options);
    expect(latestTopicTask(db)).toMatchObject({ status: 'completed', cachedCount: 1, count: 1 });
    expect(read).toHaveBeenCalledOnce();
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('提取协议发送到模型前所有对象字段均必填，原因可为null但不可省略', () => {
  const schema = z.toJSONSchema(topicExtractionSchema);
  function assertRequired(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (object.type === 'object') {
      expect(object.required).toEqual(Object.keys(object.properties as object));
      expect(object.additionalProperties).toBe(false);
    }
    for (const child of Object.values(object)) {
      if (Array.isArray(child)) child.forEach(assertRequired);
      else assertRequired(child);
    }
  }
  assertRequired(schema);
  expect(
    topicExtractionSchema.parse({ items: [{ text: 'fixture', quote: 'fixture' }], reason: null }).reason,
  ).toBeNull();
  expect(topicExtractionSchema.parse({ items: [], reason: '需要登录' }).reason).toBe('需要登录');
  expect(() => topicExtractionSchema.parse({ items: [] })).toThrow();
});

test('主动搜索追原文、新网页与抖音搜索/看后搜共同成题，摘要不能冒充证据', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topic-discovery-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig(),
      saved = await loadTopicChannels();
    const channels = saved.channels.filter((c) => c.kind === 'builtin');
    channels.push({
      ...externalFixture,
      id: 'fixture-feed',
      name: 'fixture来源',
      location: 'https://example.com/feed',
    });
    for (const [i, sourceType] of ['search', 'after_search'].entries())
      db.db
        .insert(topicSignals)
        .values({
          id: `fixture-demand-${i}`,
          sourceType,
          text: `fixture观众问题${i}`,
          capturedAt: '2026-10-20',
          updatedAt: '2026-10-20',
        })
        .run();
    vi.mocked(readTopicSources).mockImplementationOnce(async (targets, _max, hooks) => {
      const feed = {
        id: targets[0].id,
        url: targets[0].location,
        text: 'fixture来源原文',
        screenshots: [path.resolve('data/topics/fixture-topic.png')],
        error: null,
        links: [],
      };
      await hooks?.onPage?.(feed);
      const queries = await hooks?.nextBatch?.([feed]);
      expect(queries).toHaveLength(1);
      const search = {
        id: queries![0].id,
        url: queries![0].location,
        text: '摘要吹嘘：月赚百万',
        screenshots: [path.resolve('data/topics/fixture-topic.png')],
        error: null,
        links: [{ title: 'fixture实际正文', url: 'https://example.com/detail' }],
      };
      await hooks?.onPage?.(search);
      const details = await hooks?.nextBatch?.([feed, search]);
      expect(details).toHaveLength(1);
      const detail = {
        id: details![0].id,
        url: details![0].location,
        text: 'fixture详情原文，仅有商品挂牌，没有收入证据',
        screenshots: [path.resolve('data/topics/fixture-topic.png')],
        error: null,
        links: [],
      };
      await hooks?.onPage?.(detail);
      expect(await hooks?.nextBatch?.([feed, search, detail])).toEqual([]);
      return [feed, search, detail];
    });
    let researchCalls = 0;
    const read = vi.fn(async (_schema: unknown, prompt: string) => {
      if (prompt.startsWith('[topic:research]')) {
        expect(prompt).toContain('fixture观众问题0');
        expect(prompt).toContain('fixture观众问题1');
        return ++researchCalls === 1
          ? { queries: [{ engine: 'bing', text: 'fixture寻找不同用途', purpose: '核实' }], links: [] }
          : { queries: [], links: ['0'] };
      }
      if (prompt.startsWith('[topic:extract]')) {
        expect(prompt).not.toContain('月赚百万');
        const quote = prompt.includes('fixture详情原文')
          ? 'fixture详情原文，仅有商品挂牌，没有收入证据'
          : 'fixture来源原文';
        return { items: [{ text: quote, quote }], reason: null };
      }
      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
      expect(input.sources.map((s: any) => s.channel).sort()).toEqual([
        'fixture-feed',
        'followup_search',
        'open_discovery',
        'search_keywords',
      ]);
      expect(prompt).not.toContain('月赚百万');
      return { items: input.sources.map((s: any, i: number) => ({ ...fixtureItem(i), source: s.id })) };
    });
    expect(await generateTopics(db, fixtureJudge(read), { config, channels, document: 'fixture' })).toMatchObject({
      count: 4,
    });
    expect(db.db.select().from(topicSignals).all()).toHaveLength(4);
    expect(db.db.select().from(rawRecords).all()).toHaveLength(3);
    expect(latestTopicTask(db)).toMatchObject({ status: 'completed', count: 4, sourceCount: 4, cachedCount: 2 });
    expect(
      db.db
        .select()
        .from(topics)
        .all()
        .some((t) => t.sourceUrl === 'https://example.com/detail'),
    ).toBe(true);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test('复核失败保留原文与已有候选，任务明确失败，不将未审稿件入库', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'topic-editor-failure-fixture-'));
  const db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const config = await loadConfig(),
      sources = await loadTopicChannels();
    db.db
      .insert(topicSignals)
      .values({
        id: 'fixture',
        sourceType: 'search',
        text: 'fixture真实问题',
        capturedAt: '2026-10-20',
        updatedAt: '2026-10-20',
      })
      .run();
    const model = fixtureJudge(async () => ({ items: [fixtureItem(0)] }));
    const read = vi.fn(async (schema, prompt) => {
      if (prompt.startsWith('[topic:edit]')) throw Error('fixture复核失败');
      return model.read(schema, prompt);
    });
    await expect(generateTopics(db, { read } as Judgment, { config, ...sources })).rejects.toThrow('fixture复核失败');
    expect(db.db.select().from(topics).all()).toEqual([]);
    expect(db.db.select().from(topicSignals).all()).toHaveLength(1);
    expect(latestTopicTask(db)?.status).toBe('failed');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
