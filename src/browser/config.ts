import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { loadBrowserPolicy } from './policy.ts';
const platform = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]+$/),
    url: z.url(),
    domains: z.array(z.string().min(1)).min(1),
    loggedIn: z.array(z.string().min(1)),
    loggedOut: z.array(z.string().min(1)),
    loggedInPath: z.string().nullable(),
    replyPages: z
      .object({ comment: z.url().optional(), dm: z.url().optional(), hint: z.string().optional() })
      .optional(),
    riskMarkers: z.array(z.string()).default([]),
    confirmation: z.object({ button: z.string(), message: z.string(), deadline: z.string() }).optional(),
  })
  .refine(
    (p) =>
      new URL(p.url).protocol === 'https:' &&
      p.domains.some((d) => new URL(p.url).hostname === d || new URL(p.url).hostname.endsWith('.' + d)),
    '后台地址必须属于声明域名且使用 HTTPS',
  );
export type BrowserPlatform = z.infer<typeof platform>;
export async function loadBrowserConfig(root = process.cwd()) {
  const config = z
    .object({ platforms: z.array(platform) })
    .parse(parse(await readFile(path.join(root, 'config/browser.yaml'), 'utf8')));
  if (new Set(config.platforms.map((p) => p.id)).size !== config.platforms.length)
    throw new Error('浏览器平台 ID 重复');
  const policy = await loadBrowserPolicy(root);
  return config.platforms.map((p) => ({ ...p, riskMarkers: policy.riskMarkers }));
}
export function detectLogin(
  config: BrowserPlatform,
  url: string,
  text: string,
): { state: 'logged_in' | 'logged_out' | 'unknown' | 'awaiting_confirmation'; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { state: 'unknown', reason: '页面地址无法识别' };
  }
  const risk = config.riskMarkers.find((marker) => text.includes(marker));
  if (risk) return { state: 'unknown', reason: `需要处理：${risk}` };
  const onBackend = parsed.origin === new URL(config.url).origin;
  const loggedIn =
    onBackend &&
    !!config.loggedInPath &&
    parsed.pathname.includes(config.loggedInPath) &&
    config.loggedIn.length > 0 &&
    config.loggedIn.every((marker) => text.includes(marker));
  const loggedOut = config.loggedOut.some((marker) => text.includes(marker));
  if (loggedIn && !loggedOut) return { state: 'logged_in', reason: '已核实后台身份区域与后台地址' };
  if (loggedOut && !loggedIn && config.confirmation) return { state: 'awaiting_confirmation', reason: '需要微信确认' };
  if (loggedOut && !loggedIn) return { state: 'logged_out', reason: '后台显示登录入口，请登录' };
  return {
    state: 'unknown',
    reason: config.loggedIn.length
      ? '后台未显示完整登录证据，可能加载失败或页面变化'
      : '登录后页面标记尚未实测，不能确认登录',
  };
}
