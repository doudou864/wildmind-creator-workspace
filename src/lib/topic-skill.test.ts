import { test, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readTopicSkill, saveTopicSkill, topicSkillText } from './topic-skill';

test('编辑原 Skill 和引用后下一次读取立即使用新规则，旧版本不能覆盖新修改', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'topic-skill-fixture-'));
  const entry = path.join(root, 'SKILL.md');
  try {
    await mkdir(path.join(root, 'references'));
    await writeFile(entry, '---\nname: fixture\ndescription: 测试\n---\n旧规则 [来源](references/sources.md)');
    await writeFile(path.join(root, 'references/sources.md'), '旧来源');
    const first = await readTopicSkill(entry);
    const next = await saveTopicSkill(
      { id: 'SKILL.md', revision: first.revision, content: '只找省时工具 [来源](references/sources.md)' },
      entry,
      path.join(root, 'backups'),
    );
    expect(topicSkillText(next)).toContain('只找省时工具');
    expect(await readFile(entry, 'utf8')).toContain('name: fixture');
    await expect(
      saveTopicSkill(
        { id: 'SKILL.md', revision: first.revision, content: '过期覆盖' },
        entry,
        path.join(root, 'backups'),
      ),
    ).rejects.toThrow('另一处');
    const last = await saveTopicSkill(
      { id: 'references/sources.md', revision: next.revision, content: '新来源 https://example.org' },
      entry,
      path.join(root, 'backups'),
    );
    expect(topicSkillText(last)).toContain('新来源 https://example.org');
    expect(last.revision).not.toBe(next.revision);
    expect(
      JSON.parse(await readFile(path.join(root, 'backups', first.revision + '.json'), 'utf8')).files[0].content,
    ).toContain('旧规则');
    await expect(
      saveTopicSkill(
        { id: '../outside.md', revision: last.revision, content: '越界' },
        entry,
        path.join(root, 'backups'),
      ),
    ).rejects.toThrow('只能编辑');
    await expect(
      saveTopicSkill(
        { id: 'SKILL.md', revision: last.revision, content: '[错误引用](references/missing.md)' },
        entry,
        path.join(root, 'backups'),
      ),
    ).rejects.toThrow('不存在');
    expect((await readTopicSkill(entry)).revision).toBe(last.revision);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
