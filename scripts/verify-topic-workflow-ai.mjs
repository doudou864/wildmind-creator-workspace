// Explicit opt-in smoke test: uses the real model but only a temporary fixture database.
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../src/db/database.ts';
import { topicSignals, topics } from '../src/db/schema.ts';
import { loadConfig } from '../src/lib/config.ts';
import { generateTopics } from '../src/lib/topic-store.ts';
import { CodexJudgment } from '../src/ai/structured.ts';
if (!process.argv.includes('--run-model')) throw Error('需要显式 --run-model 才会消耗模型额度');
const folder = await mkdtemp(path.join(tmpdir(), 'topic-ai-fixture-'));
const db = await initializeDatabase(path.join(folder, 'workspace.db'));
const now = new Date().toISOString();
const materials = [
  '【虚构测试资料，不是真实机会】积木数据公司招聘居家装配录像员，用手机录制双手组装积木。完成培训后，合格录像按有效时长结算；未通过验收的视频不付费。没有提供实际收入金额。',
  '【虚构测试资料】虚构工具“补句”允许创作者修改口播字幕后，只重新合成说错的那一句。测试者保留了其余原录音，展示了修改前后音轨；不支持所有方言，需要本人声音授权。',
  '【虚构测试资料】虚构店铺“掌心小屋”将顾客的老房子照片用AI辅助设计成桌面微缩摆件，页面有三条独立买家晒图和“送父母”的评价。标价199元，没有成本、利润及月销量信息。',
  '【虚构测试资料】虚构服装卖家用AI估算商品照片里的衣长，没有实际量尺。实物衣长与页面不符导致退货，之后改用实测尺寸再让AI排版。单一自述案例，没有统计发生率。',
];
try {
  for (const [i, text] of materials.entries())
    db.db
      .insert(topicSignals)
      .values({
        id: `fixture-${i}`,
        sourceType: 'fixture_source',
        text,
        sourceUrl: `https://example.com/fixture/${i}`,
        capturedAt: now,
        updatedAt: now,
      })
      .run();
  const config = await loadConfig();
  config.parameters.topicCandidateCount = 6;
  const model = new CodexJudgment();
  const calls = [];
  const judgment = {
    read: async (schema, prompt, images) => {
      const stage = prompt.match(/\[topic:\w+\]/)?.[0];
      console.log('开始', stage);
      const result = await model.read(schema, prompt, images);
      calls.push({ stage, result });
      console.log('完成', stage);
      return result;
    },
  };
  const result = await generateTopics(db, judgment, {
    config,
    channels: [
      {
        id: 'fixture_source',
        name: '虚构验收材料',
        enabled: true,
        kind: 'builtin',
        type: 'fixture',
        location: '',
        focus: 'fixture',
        frequency: '',
        note: '',
      },
    ],
    document: '仅为隔离验收：资料是虚构案例，不能当成真实机会。',
  });
  const output = {
    fixture: true,
    warning: '仅验证流程，以下为虚构材料生成，不可发布',
    result,
    calls,
    topics: db.db.select().from(topics).all(),
  };
  await mkdir('docs/verification/topic-workflow', { recursive: true });
  await writeFile('docs/verification/topic-workflow/model-fixture.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify({ ...result, titles: output.topics.map((t) => t.title) }, null, 2));
} finally {
  db.sqlite.close();
  await rm(folder, { recursive: true, force: true });
}
