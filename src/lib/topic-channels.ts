import { readFile, writeFile, rename, mkdir, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { acquireJobLock } from '../jobs/lock.ts';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

const channelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  kind: z.enum(['builtin', 'external']),
  type: z.string(),
  location: z.string(),
  focus: z.string(),
  frequency: z.string(),
  note: z.string(),
});
export type TopicChannel = z.infer<typeof channelSchema>;
const channelFile = () => path.join(process.cwd(), 'config', '选题输入渠道.md');
export async function loadTopicChannels(filename = channelFile()) {
  const document = await readFile(filename, 'utf8');
  const block = document.match(/```yaml\s*\n([\s\S]*?)```/);
  if (!block) throw new Error('选题输入渠道.md 缺少 YAML 渠道配置');
  const { channels } = z.object({ channels: z.array(channelSchema) }).parse(parse(block[1]));
  if (new Set(channels.map((channel) => channel.id)).size !== channels.length)
    throw new Error('选题渠道 id 不允许重复');
  return { channels, document, revision: createHash('sha256').update(document).digest('hex') };
}

const title = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((v) => !v.includes('```'), '标题不能包含代码围栏');
const link = z
  .string()
  .trim()
  .url()
  .max(4000)
  .refine((v) => {
    const url = new URL(v);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !v.includes('```');
  }, '请填写完整的 http 或 https 网页链接');
export const channelEditSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), revision: z.string(), title, link }).strict(),
  z.object({ action: z.literal('edit'), revision: z.string(), id: z.string(), title, link }).strict(),
  z.object({ action: z.literal('remove'), revision: z.string(), id: z.string() }).strict(),
]);
export async function editTopicChannel(
  input: unknown,
  filename = channelFile(),
  backupDir = path.resolve('data/backups/topic-channels'),
) {
  const edit = channelEditSchema.parse(input);
  const release = await acquireJobLock(path.join(backupDir, 'write.pid'));
  if (!release) throw Error('另一处正在保存渠道，请稍后重试');
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try {
    const current = await loadTopicChannels(filename);
    if (current.revision !== edit.revision) throw Error('渠道已在另一处修改，请刷新渠道后重试，当前输入已保留');
    const channels = [...current.channels];
    if (edit.action === 'add')
      channels.push({
        id: 'external_' + randomUUID(),
        name: edit.title,
        location: edit.link,
        enabled: true,
        kind: 'external',
        type: '网页',
        focus: '',
        frequency: '生成选题时',
        note: '',
      });
    else {
      const index = channels.findIndex((c) => c.id === edit.id);
      if (index < 0) throw Error('该渠道已不存在，请刷新渠道');
      if (channels[index].kind !== 'external') throw Error('这里只编辑自行添加的网页渠道，内置来源保持不变');
      if (edit.action === 'remove') channels.splice(index, 1);
      else channels[index] = { ...channels[index], name: edit.title, location: edit.link };
    }
    const document = current.document.replace(
      /```yaml\s*\n[\s\S]*?```/,
      () => '```yaml\n' + stringify({ channels }) + '```',
    );
    await mkdir(backupDir, { recursive: true });
    await writeFile(path.join(backupDir, current.revision + '.md'), current.document, { mode: 0o600 });
    await writeFile(temporary, document, 'utf8');
    await rename(temporary, filename);
    return await loadTopicChannels(filename);
  } finally {
    await rm(temporary, { force: true });
    await release();
  }
}
