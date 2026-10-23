import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
export type ImageChatSkill = { id: string; name: string; description: string; path: string; instructions: string };
export async function loadImageChatSkills(roots?: string[]): Promise<ImageChatSkill[]> {
  if (!roots) {
    roots = z
      .object({ roots: z.array(z.string()) })
      .parse(parse(await readFile('config/image-chat-skills.yaml', 'utf8'))).roots;
  }
  const found = new Map<string, ImageChatSkill>();
  async function scan(directory: string, depth: number) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw e;
    }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.name === 'SKILL.md' && entry.isFile()) {
        const resolved = await realpath(file);
        if (found.has(resolved)) continue;
        const instructions = await readFile(resolved, 'utf8');
        const header = instructions.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!header) continue;
        const meta = z.object({ name: z.string(), description: z.string().default('') }).parse(parse(header[1]));
        found.set(resolved, {
          id: createHash('sha256').update(resolved).digest('hex'),
          ...meta,
          path: resolved,
          instructions,
        });
      } else if (depth > 0 && (entry.isDirectory() || entry.isSymbolicLink())) await scan(file, depth - 1);
    }
  }
  for (const root of roots) await scan(root.replace(/^~(?=\/|$)/, os.homedir()), 2);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export async function resolveImageChatSkill(id: string | null) {
  if (!id) return null;
  const skill = (await loadImageChatSkills()).find((s) => s.id === id);
  if (!skill) throw Error('所选技能已不存在，请刷新技能列表后重选。');
  return skill;
}
