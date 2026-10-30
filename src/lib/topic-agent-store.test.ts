import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { topics, topicGenerationTasks, rawRecords } from '../db/schema';
import { generateSkillTopics, topicAgentStepSchema } from './topic-agent-store';
import { loadTopicSkillConfig, type TopicSkill } from './topic-skill';
import type { Judgment } from '../ai/structured';
import type { readTopicSources } from '../browser/topic-source';
import { taskProgress } from '../jobs/topic-task-state';
import { z } from 'zod';

const skill: TopicSkill = {
  name: 'fixture',
  path: '/fixture/SKILL.md',
  revision: 'fixture-v2',
  files: [
    { id: 'SKILL.md', header: '', content: '【隔离规则】只讲省时间，直接观察 https://example.org/tool，不要赚钱题。' },
  ],
};
const raw = '【隔离事实】这款虚构工具可以将三次文件整理合并为一次操作。';
const readPages: typeof readTopicSources = async (initial, _screens, hooks) => {
  const page = {
    id: initial[0].id,
    url: initial[0].location,
    text: raw,
    error: null,
    screenshots: ['/fixture/page.png'],
    links: [],
  };
  hooks?.onStart?.(page.id);
  await hooks?.onPage?.(page);
  await hooks?.nextBatch?.([page]);
  return [page];
};
async function fixture(run: (db: Awaited<ReturnType<typeof initializeDatabase>>) => Promise<void>) {
  const root = await mkdtemp(path.join(tmpdir(), 'topic-agent-fixture-'));
  const db = await initializeDatabase(path.join(root, 'workspace.db'));
  const now = new Date().toISOString();
  db.db.insert(topicGenerationTasks).values({ id: 'fixture', status: 'queued', createdAt: now, updatedAt: now }).run();
  try {
    await run(db);
  } finally {
    db.sqlite.close();
    await rm(root, { recursive: true, force: true });
  }
}
function agent(quote = raw, fail = false): Judgment {
  let n = 0;
  return {
    read: async <T extends z.ZodType>(schema: T, prompt: string, _images?: string[], purpose?: 'topicEditorial') => {
      expect(prompt).toContain(skill.files[0].content);
      expect(prompt).not.toContain('draftMultiplier');
      expect(prompt).not.toContain('12.7元');
      expect(prompt).not.toContain('最多40个草稿');
      expect(purpose).toBe('topicEditorial');
      if (n++ === 0)
        return schema.parse({
          action: 'browse',
          activity: '查看 Skill 指定页面',
          requests: [{ kind: 'page', value: 'https://example.org/tool' }],
          items: [],
          note: '',
        });
      expect(prompt).toContain(raw);
      if (fail) throw Error('隔离模型失败');
      return schema.parse({
        action: 'finish',
        activity: '完成',
        requests: [],
        items: [{ entity: raw, angle: '【隔离选题】整理文件能少做两步？', evidence: [{ sourceId: 'page-1', quote }] }],
        note: '隔离研究说明',
      });
    },
  };
}
test('Skill 决定读页与交付，新入口不注入旧编辑规则；实体角度分别保存且记录版本', async () =>
  fixture(async (db) => {
    const result = await generateSkillTopics(db, 'fixture', { skill, judgment: agent(), readPages });
    expect(result.count).toBe(1);
    expect(db.db.select().from(topics).get()).toMatchObject({
      direction: raw,
      title: '【隔离选题】整理文件能少做两步？',
      channelId: 'topic_skill',
      status: 'candidate',
    });
    expect(taskProgress(db, 'fixture')).toMatchObject({
      skillRevision: 'fixture-v2',
      count: 1,
      stage: 'finished',
      warning: '隔离研究说明',
    });
  }));
test('虚构引用不能写入候选，实际已读材料仍保存', async () =>
  fixture(async (db) => {
    expect(
      (await generateSkillTopics(db, 'fixture', { skill, judgment: agent('页面没有这句话'), readPages })).count,
    ).toBe(0);
    expect(db.db.select().from(topics).all()).toHaveLength(0);
    expect(db.db.select().from(rawRecords).all()).toHaveLength(1);
    expect(taskProgress(db, 'fixture').warning).toContain('引用不符');
  }));
test('模型失败不写半批候选、不丢已读材料，并明确标失败', async () =>
  fixture(async (db) => {
    await expect(generateSkillTopics(db, 'fixture', { skill, judgment: agent(raw, true), readPages })).rejects.toThrow(
      '隔离模型失败',
    );
    expect(db.db.select().from(topicGenerationTasks).get()?.status).toBe('failed');
    expect(db.db.select().from(rawRecords).all()).toHaveLength(1);
    expect(db.db.select().from(topics).all()).toHaveLength(0);
  }));
test('宿主预算耗尽不无限循环或悄悄降级旧流程', async () =>
  fixture(async (db) => {
    await expect(
      generateSkillTopics(db, 'fixture', {
        skill,
        judgment: agent(),
        readPages,
        runtime: { ...(await loadTopicSkillConfig()), maxTurns: 1 },
      }),
    ).rejects.toThrow('上限');
  }));
test('Agent 协议满足结构化输出必填字段', () => {
  const schema = z.toJSONSchema(topicAgentStepSchema);
  expect(schema.required).toEqual(expect.arrayContaining(['action', 'activity', 'requests', 'items', 'note']));
});
