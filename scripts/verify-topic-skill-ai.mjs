// Real model, isolated synthetic material and database. No website or production candidate is touched.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../src/db/database.ts';
import { topics, topicGenerationTasks } from '../src/db/schema.ts';
import { readTopicSkill, topicSkillText, loadTopicSkillConfig } from '../src/lib/topic-skill.ts';
import { generateSkillTopics } from '../src/lib/topic-agent-store.ts';
import { CodexJudgment } from '../src/ai/structured.ts';
const directory = await mkdtemp(path.join(tmpdir(), 'topic-skill-real-ai-fixture-'));
const db = await initializeDatabase(path.join(directory, 'workspace.db'));
const skill = await readTopicSkill();
skill.files.push({
  id: 'fixture-only.md',
  header: '',
  content:
    '本轮为隔离测试：只观察 https://example.org/fixture-tool，宿主返回显式虚构测试材料。只交付1条；角度必须以“【隔离测试】”开头，从省时间找观看理由，不写收入。这项要求仅对当前临时副本生效，未修改用户 Skill。',
});
const text =
  '【虚构测试材料】2026年10月30日，虚构的「收件整理器」演示了一个原型：用户选中一组邮件附件后，工具按文件内容命名并归入对应项目文件夹。演示中原本要逐份打开、重命名、移动的30个附件，在一次确认后完成整理。没有商业用户数据，也没有收入信息。';
const now = new Date().toISOString();
db.db
  .insert(topicGenerationTasks)
  .values({ id: 'fixture-real-ai', status: 'queued', createdAt: now, updatedAt: now })
  .run();
const judgment = new CodexJudgment();
const calls = [];
try {
  const result = await generateSkillTopics(db, 'fixture-real-ai', {
    skill,
    runtime: { ...(await loadTopicSkillConfig()), maxTurns: 3, maxPages: 1 },
    judgment: {
      read: async (schema, prompt, images, purpose) => {
        const value = await judgment.read(schema, prompt, images, purpose);
        calls.push(value);
        console.log(JSON.stringify({ action: value.action, activity: value.activity }));
        return value;
      },
    },
    readPages: async (targets, _screens, hooks) => {
      const pages = [];
      for (const target of targets) {
        if (target.location !== 'https://example.org/fixture-tool') throw Error('隔离测试禁止访问其他地址');
        const page = { id: target.id, url: target.location, text, screenshots: [], links: [], error: null };
        hooks.onStart?.(page.id);
        await hooks.onPage?.(page);
        pages.push(page);
      }
      const next = await hooks.nextBatch?.(pages);
      if (next?.length) throw Error('隔离测试不继续浏览');
      return pages;
    },
  });
  const records = db.db.select().from(topics).all();
  if (result.count !== 1 || !records[0].title.startsWith('【隔离测试】'))
    throw Error('模型未遵守临时 Skill 的明确交付要求');
  await mkdir('docs/verification/topic-skill', { recursive: true });
  await writeFile(
    'docs/verification/topic-skill/model-fixture.json',
    JSON.stringify(
      { directory, result, calls, records, skillRevision: skill.revision, skillLoaded: topicSkillText(skill).length },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ result, angle: records[0].title, directory }));
} finally {
  db.sqlite.close();
}
