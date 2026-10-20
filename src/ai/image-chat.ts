import { Codex } from '@openai/codex-sdk';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, mkdir, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse } from 'yaml';
import { z } from 'zod';
import type { GenerationConfig } from './image-generation';
export const CHAT_INSTRUCTIONS =
  '这是本机作品配图对话。用户文字和参考图保持原样。需要生图时仅调用一次内置 image_gen，使用 ChatGPT 套餐；不调用 API、第三方服务，不运行命令，不启动子代理，不访问浏览器。不自动重试。生成图片保留在 Codex generated_images 目录，工作台会自动收取；不要另存或删除用户文件。文字回答直接给用户。';
export type ChatTransport = (input: {
  text: string;
  references: string[];
  threadId: string | null;
  config: GenerationConfig;
  onThread: (id: string) => void;
  onText: (text: string) => void;
}) => Promise<{ threadId: string; files: string[]; text: string }>;
export const streamImageChat: ChatTransport = async (input) => {
  const ai = z.object({ codexPath: z.string() }).parse(parse(await readFile('config/ai.yaml', 'utf8')));
  const login = await promisify(execFile)(ai.codexPath, ['login', 'status'], { timeout: 15000 });
  if (!/Logged in using ChatGPT/.test(login.stdout + login.stderr)) throw Error('Codex 未使用 ChatGPT 登录');
  const directory = path.resolve('data/ai/images');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const rootFor = (id: string) => {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw Error('Invalid thread id');
    return path.resolve(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'generated_images', id);
  };
  const before = new Set(input.threadId ? await readdir(rootFor(input.threadId)).catch(() => []) : []);
  const codex = new Codex({
    codexPathOverride: ai.codexPath,
    env: Object.fromEntries(
      Object.entries(process.env).filter(([k, v]) => k !== 'OPENAI_API_KEY' && typeof v === 'string'),
    ) as Record<string, string>,
    config: {
      features: {
        shell_tool: false,
        apps: false,
        multi_agent: false,
        image_generation: true,
        browser_use: false,
        computer_use: false,
      },
    },
    configOverrides: ['mcp_servers={}'],
  });
  const options = {
    workingDirectory: directory,
    skipGitRepoCheck: true,
    sandboxMode: 'workspace-write' as const,
    approvalPolicy: 'never' as const,
    webSearchMode: 'disabled' as const,
    ...(input.config.model ? { model: input.config.model } : {}),
  };
  const thread = input.threadId ? codex.resumeThread(input.threadId, options) : codex.startThread(options);
  const { events } = await thread.runStreamed(
    [
      { type: 'text', text: CHAT_INSTRUCTIONS },
      { type: 'text', text: input.text },
      ...input.references.map((p) => ({ type: 'local_image' as const, path: p })),
    ],
    { signal: AbortSignal.timeout(input.config.timeoutMs) },
  );
  const messages = new Map<string, string>();
  for await (const event of events) {
    if (event.type === 'thread.started') input.onThread(event.thread_id);
    if ((event.type === 'item.updated' || event.type === 'item.completed') && event.item.type === 'agent_message') {
      messages.set(event.item.id, event.item.text);
      input.onText([...messages.values()].join('\n\n'));
    }
    if (event.type === 'turn.failed') throw Error(event.error.message);
    if (event.type === 'error') throw Error(event.message);
  }
  if (!thread.id) throw Error('Codex did not return a thread id');
  const root = rootFor(thread.id),
    files: string[] = [];
  for (const name of await readdir(root).catch(() => [])) {
    if (before.has(name) || !/\.(png|jpe?g)$/i.test(name)) continue;
    const file = path.join(root, name);
    if ((await lstat(file)).isFile() && (await realpath(file)).startsWith((await realpath(root)) + path.sep))
      files.push(file);
  }
  return { threadId: thread.id, files, text: [...messages.values()].join('\n\n') };
};
