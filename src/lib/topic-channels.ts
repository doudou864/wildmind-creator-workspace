import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const channelSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), enabled: z.boolean(),
  kind: z.enum(['builtin', 'external']), type: z.string(), location: z.string(),
  focus: z.string(), frequency: z.string(), note: z.string(),
});
export type TopicChannel = z.infer<typeof channelSchema>;
export async function loadTopicChannels() {
  const document = await readFile(path.join(process.cwd(), 'config', '选题输入渠道.md'), 'utf8');
  const block = document.match(/```yaml\s*\n([\s\S]*?)```/);
  if (!block) throw new Error('选题输入渠道.md 缺少 YAML 渠道配置');
  const { channels } = z.object({ channels: z.array(channelSchema) }).parse(parse(block[1]));
  if (new Set(channels.map(channel => channel.id)).size !== channels.length) throw new Error('选题渠道 id 不允许重复');
  return { channels, document };
}
