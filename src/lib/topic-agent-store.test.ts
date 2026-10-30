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

import { TopicReadInterrupted } from '../browser/topic-source';
import { vi } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { topicSkillSnapshotPath } from './topic-skill';
import { saveTaskProgress } from '../jobs/topic-task-state';

test('浏览器超时后仅用已读原文交付，不重新浏览且明确说明中断范围', async () =>
  fixture(async (db) => {
    let calls = 0;
    const readPages: typeof readTopicSources = async (initial, _screens, hooks) => {
      calls++;
      const page = { id: initial[0].id, url: initial[0].location, text: raw, error: null, screenshots: [], links: [] };
      await hooks?.onPage?.(page);
      throw new TopicReadInterrupted('浏览器操作超时；请查看 ego 窗口，未自动重试', [page]);
    };
    expect((await generateSkillTopics(db, 'fixture', { skill, judgment: agent(), readPages })).count).toBe(1);
    expect(calls).toBe(1);
    expect(taskProgress(db, 'fixture')).toMatchObject({
      sourceCount: 1,
      demandCount: 0,
      warning: expect.stringContaining('已停止浏览'),
    });
  }));
test('用户接管必须结束整个任务，不能用超时降级逻辑绕过', async () =>
  fixture(async (db) => {
    const judgment = agent();
    const original = judgment.read;
    const read = vi.fn(original);
    await expect(
      generateSkillTopics(db, 'fixture', {
        skill,
        judgment: { read: read as Judgment['read'] },
        readPages: async () => {
          throw Error('控制权已交给用户，不自动重试');
        },
      }),
    ).rejects.toThrow('控制权');
    expect(read).toHaveBeenCalledOnce();
  }));
test('超时但没有网页原文时不拿需求词或搜索摘要编题', async () =>
  fixture(async (db) => {
    await expect(
      generateSkillTopics(db, 'fixture', {
        skill,
        judgment: agent(),
        readPages: async () => {
          throw new TopicReadInterrupted('浏览器操作超时', []);
        },
      }),
    ).rejects.toThrow('没有取得');
    expect(db.db.select().from(topics).all()).toHaveLength(0);
  }));
test('续接只用失败批次的材料与原日期，保留旧失败记录且不调用浏览器', async () =>
  fixture(async (db) => {
    const date = '2026-10-20T01:00:00.000Z';
    db.db.update(topicGenerationTasks).set({ status: 'failed', reason: '浏览器操作超时' }).run();
    const file = topicSkillSnapshotPath(db.filename, 'fixture');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(skill));
    db.db
      .insert(rawRecords)
      .values({
        id: 'material',
        platformId: 'topic_skill',
        dataDate: '2026-10-20',
        type: 'topic_source',
        sourcePath: 'data/fixture.json',
        capturedAt: date,
        updatedAt: date,
        content: {
          taskId: 'fixture',
          id: 'page-1',
          url: 'https://example.org/tool',
          text: raw,
          error: null,
          screenshots: [],
          discoveryOnly: false,
        },
      })
      .run();
    db.db
      .insert(topicGenerationTasks)
      .values({ id: 'resumed', status: 'queued', createdAt: date, updatedAt: date })
      .run();
    saveTaskProgress(db, 'resumed', { resumeFrom: 'fixture' });
    const reader = vi.fn(async () => {
      throw Error('不应浏览');
    });
    const judgment: Judgment = {
      read: async (schema, prompt) => {
        expect(prompt).toContain('禁止再请求搜索或页面');
        expect(prompt).toContain(date);
        return schema.parse({
          action: 'finish',
          activity: '完成',
          requests: [],
          items: [{ entity: raw, angle: '【隔离续接】整理文件省两步', evidence: [{ sourceId: 'page-1', quote: raw }] }],
          note: '',
        });
      },
    };
    expect((await generateSkillTopics(db, 'resumed', { skill, judgment, readPages: reader })).count).toBe(1);
    expect(reader).not.toHaveBeenCalled();
    expect(
      db.db
        .select()
        .from(topicGenerationTasks)
        .all()
        .find((t) => t.id === 'fixture')?.status,
    ).toBe('failed');
    expect(db.db.select().from(topics).get()?.sourceContext).toContain(date);
  }));
