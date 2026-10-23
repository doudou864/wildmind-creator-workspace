import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import type { Judgment } from '../ai/structured';
import {
  editTopicDrafts,
  loadTopicWorkflow,
  topicDraftSchema,
  topicEditorialSchema,
  type TopicDraft,
} from './topic-workflow';
import { discoveryPlanSchema, createTopicDiscovery } from './topic-discovery';

const draft = (i: number): TopicDraft => ({
  title: `fixture题${i}`,
  entity: '宠物定制挂件',
  angle: `观看理由${i}`,
  viewerBenefit: '找到实物定制的新用途',
  curiosity: '',
  payoff: '展示商品及买家反馈',
  source: '0',
  evidenceQuote: 'fixture在售商品',
  exploration: false,
  explorationReason: '',
  similar: [],
  recommendFire: false,
});
const sources = [
  {
    text: 'fixture在售商品，尚无成交记录',
    channel: 'open_discovery',
    capturedAt: '2026-10-23',
    sourceUrl: 'https://example.com/product',
  },
];
const verdict = (i: number, extra = {}) => ({
  draftId: String(i),
  title: `fixture题${i}`,
  entityKey: '同一宠物挂件',
  angleKey: `理由${i}`,
  interest: true,
  supported: true,
  distinct: true,
  reason: 'fixture复核',
  ...extra,
});

test('观点复核分别筛兴趣和事实，同实体换词不凑数，少量合格题仍返回', async () => {
  const config = await loadTopicWorkflow();
  const read = vi.fn(async () => ({
    items: [
      verdict(0, { title: '用AI生成宠物挂件，人人都能日入两千', supported: false }),
      verdict(1, { interest: false }),
      verdict(2),
      verdict(3, { angleKey: '理由2' }),
      verdict(4),
      verdict(5),
    ],
  }));
  const result = await editTopicDrafts(
    { read } as unknown as Judgment,
    config,
    Array.from({ length: 6 }, (_, i) => draft(i)),
    sources,
    [],
    20,
  );
  expect(result.items.map((d) => d.title)).toEqual(['fixture题2', 'fixture题4']);
  expect(result.rejected).toBe(4);
  const prompt = read.mock.calls[0] as unknown as [unknown, string];
  expect(prompt[1]).toContain('挂牌不是成交');
  expect(prompt[1]).toContain('强烈好奇');
});

test('没有原文、未知来源和没有观看理由不能进复核；已有句子不重复生成', async () => {
  const config = await loadTopicWorkflow();
  const read = vi.fn(async () => ({ items: [verdict(0, { title: 'Ｆｉｘｔｕｒｅ题！' })] }));
  const result = await editTopicDrafts(
    { read } as unknown as Judgment,
    config,
    [
      draft(0),
      { ...draft(1), source: '99' },
      { ...draft(2), evidenceQuote: '已赚万元' },
      { ...draft(3), viewerBenefit: '', curiosity: '' },
    ],
    sources,
    [{ title: 'fixture题', status: 'selected' }],
    20,
  );
  expect(result.items).toEqual([]);
  const prompt = (read.mock.calls[0] as unknown as [unknown, string])[1];
  const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1));
  expect(input.drafts).toHaveLength(1);
});

test('搜索只能用配置入口和真实观察链接，预算固定且同链接不重读', async () => {
  const config = { ...(await loadTopicWorkflow()), maxQueries: 1, maxFollowLinks: 1 };
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      queries: [{ engine: 'bing', text: 'AI 宠物', purpose: '商品用途' }],
      links: ['0', '1', '99'],
    })
    .mockResolvedValue({ queries: [{ engine: 'bing', text: '超预算', purpose: '' }], links: ['0'] });
  const discover = createTopicDiscovery(
    { read } as unknown as Judgment,
    config,
    { signals: [{ text: '抖音看后搜需求' }], feedback: [], disabledUrls: [] },
    () => {},
  );
  const page = {
    id: 'feed',
    url: 'https://example.com/feed',
    text: 'fixture原文',
    screenshots: [],
    error: null,
    links: [
      { title: '商品', url: 'https://example.com/item' },
      { title: '本机', url: 'http://127.0.0.1:3000/private' },
    ],
  };
  const next = await discover([page]);
  expect(next).toHaveLength(2);
  expect(next[0]).toMatchObject({
    location: 'https://www.bing.com/search?q=AI%20%E5%AE%A0%E7%89%A9',
    discoveryOnly: true,
  });
  expect(next[1]).toMatchObject({ location: 'https://example.com/item', allowRedirect: true, discoveryOnly: false });
  expect(await discover([page])).toEqual([]);
  expect(read).toHaveBeenCalledOnce();
  expect(read.mock.calls[0][1]).toContain('抖音看后搜需求');
});

test('没有固定渠道仍可规划主动搜索，随后追查搜索结果正文，未知入口不导航', async () => {
  const config = await loadTopicWorkflow();
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      queries: [
        { engine: 'bing', text: 'AI 工具节省时间 实践', purpose: '案例' },
        { engine: 'invented', text: '不可使用', purpose: '' },
      ],
      links: [],
    })
    .mockResolvedValueOnce({ queries: [], links: ['0'] });
  const discover = createTopicDiscovery(
    { read } as unknown as Judgment,
    config,
    { signals: [], feedback: [], disabledUrls: [] },
    () => {},
  );
  expect(await discover([])).toHaveLength(1);
  const next = await discover([
    {
      id: 'search',
      url: 'https://www.bing.com/search?q=fixture',
      text: '摘要',
      error: null,
      screenshots: [],
      links: [{ title: '原文', url: 'https://example.com/original' }],
    },
  ]);
  expect(next[0].location).toBe('https://example.com/original');
  expect(await discover([])).toEqual([]);
});

test('所有新模型协议均符合必填字段约束，避免再次出现reason缺失的整批请求故障', () => {
  function inspect(value: unknown) {
    if (!value || typeof value !== 'object') return;
    const o = value as Record<string, unknown>;
    if (o.type === 'object') {
      expect(o.required).toEqual(Object.keys(o.properties as object));
      expect(o.additionalProperties).toBe(false);
    }
    Object.values(o).forEach((v) => (Array.isArray(v) ? v.forEach(inspect) : inspect(v)));
  }
  [topicDraftSchema, topicEditorialSchema, discoveryPlanSchema].forEach((s) => inspect(z.toJSONSchema(s)));
});

test('初轮固定来源再多也为搜索结果预留正文预算，避免付费规划后只看摘要', async () => {
  const config = { ...(await loadTopicWorkflow()), maxQueries: 1, maxFollowLinks: 4 };
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      queries: [{ engine: 'bing', text: 'fixture研究', purpose: '核实' }],
      links: ['0', '1', '2', '3'],
    })
    .mockResolvedValueOnce({ queries: [], links: ['2'] });
  const discover = createTopicDiscovery(
    { read } as unknown as Judgment,
    config,
    { signals: [], feedback: [], disabledUrls: [] },
    () => {},
  );
  const feed = {
    id: 'feed',
    url: 'https://example.com/feed',
    text: 'fixture',
    screenshots: [],
    error: null,
    links: Array.from({ length: 4 }, (_, i) => ({ title: `文章${i}`, url: `https://example.com/article/${i}` })),
  };
  expect(await discover([feed])).toHaveLength(3); // one search + only half the detail budget
  const search = {
    id: 'search',
    url: 'https://www.bing.com/search?q=fixture',
    text: '摘要',
    screenshots: [],
    error: null,
    links: [{ title: '新的原文', url: 'https://example.org/original' }],
  };
  expect(await discover([feed, search])).toMatchObject([
    { location: 'https://example.org/original', discoveryOnly: false },
  ]);
});
