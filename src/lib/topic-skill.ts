import { readFile, writeFile, mkdir, rename, rm, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
import { acquireJobLock } from '../jobs/lock.ts';

export const topicSkillConfigSchema = z.object({
  path: z.string().min(1),
  maxTurns: z.number().int().positive(),
  maxPages: z.number().int().positive(),
  maxPageCharacters: z.number().int().positive(),
  maxContextCharacters: z.number().int().positive(),
  searchTemplate: z.string().url(),
});
export async function loadTopicSkillConfig() {
  return topicSkillConfigSchema.parse(parse(await readFile('config/topic-skill.yaml', 'utf8')));
}
export type TopicSkill = {
  path: string;
  name: string;
  revision: string;
  files: { id: string; content: string; header: string }[];
};
export async function readTopicSkill(filename?: string): Promise<TopicSkill> {
  const entry = await realpath(filename ?? (await loadTopicSkillConfig()).path);
  const root = path.dirname(entry),
    files: TopicSkill['files'] = [],
    queue = [path.basename(entry)];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const file = await realpath(path.resolve(root, id));
    if (!file.startsWith(root + path.sep)) throw Error('Skill 引用必须位于当前技能目录内');
    const source = await readFile(file, 'utf8');
    if (source.length > 200000 || queue.length > 30) throw Error('Skill 内容过大，请精简后再保存');
    const header = i === 0 ? (source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/)?.[0] ?? '') : '';
    if (i === 0 && !header) throw Error('Skill 缺少名称与说明，请检查原文件');
    files.push({ id, content: source.slice(header.length), header });
    for (const match of source.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:|^\//i.test(match[1])) continue;
      const next = path.normalize(path.join(path.dirname(id), match[1]));
      if (next.startsWith('..')) throw Error('Skill 引用不能超出当前技能目录');
      if (!queue.includes(next)) queue.push(next);
    }
  }
  const meta = z
    .object({ name: z.string().min(1), description: z.string() })
    .parse(parse(files[0].header.replace(/^---\r?\n|---\r?\n$/g, '')));
  return {
    path: entry,
    name: meta.name,
    files,
    revision: createHash('sha256').update(JSON.stringify(files)).digest('hex'),
  };
}
export const skillEditSchema = z
  .object({ id: z.string(), content: z.string().trim().min(1).max(200000), revision: z.string() })
  .strict();
export async function saveTopicSkill(
  input: unknown,
  filename?: string,
  backups = path.resolve('data/backups/topic-skill'),
) {
  const edit = skillEditSchema.parse(input);
  const release = await acquireJobLock(path.join(backups, 'save.pid'));
  if (!release) throw Error('Skill 正在保存，请稍后再试');
  let temporary = '';
  try {
    const current = await readTopicSkill(filename);
    if (edit.revision !== current.revision) throw Error('Skill 已在另一处修改；你的文字已保留，请重新读取后合并');
    const file = current.files.find((f) => f.id === edit.id);
    if (!file) throw Error('只能编辑当前 Skill 及其引用的文档');
    // Validate referenced paths before writing so a typo cannot break the next run.
    for (const match of edit.content.matchAll(/\]\(([^)\s]+\.md)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:|^\//i.test(match[1])) continue;
      const target = await realpath(path.resolve(path.dirname(current.path), path.dirname(file.id), match[1])).catch(
        () => {
          throw Error('引用文档不存在，请检查链接');
        },
      );
      if (!target.startsWith(path.dirname(current.path) + path.sep)) throw Error('Skill 引用不能超出当前技能目录');
    }
    await mkdir(backups, { recursive: true });
    await writeFile(path.join(backups, current.revision + '.json'), JSON.stringify(current, null, 2), { mode: 0o600 });
    const target = path.resolve(path.dirname(current.path), file.id);
    temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, file.header + edit.content + '\n', { mode: 0o600 });
    await rename(temporary, target);
    return await readTopicSkill(current.path);
  } finally {
    if (temporary) await rm(temporary, { force: true });
    await release();
  }
}
export function topicSkillText(skill: TopicSkill) {
  return skill.files.map((f) => `--- ${f.id} ---\n${f.header}${f.content}`).join('\n\n');
}
export function topicSkillSnapshotPath(filename: string, taskId: string) {
  if (!/^[\w-]+$/.test(taskId)) throw Error('选题任务标识无效');
  return path.join(path.dirname(filename), 'jobs', `topic-skill-${taskId}.json`);
}
