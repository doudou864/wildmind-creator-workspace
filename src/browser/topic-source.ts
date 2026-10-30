import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { runEgo } from './ego.ts';
import { CollectionSession } from './collection-session.ts';
import { loadBrowserPolicy, pause, randomBetween } from './policy.ts';
import { acquireJobLock } from '../jobs/lock.ts';
export type ExternalTopicPage = {
  id: string;
  url: string;
  text: string;
  screenshots: string[];
  error: string | null;
  warning?: string;
  links?: { title: string; url: string }[];
};
export type TopicReadTarget = { id: string; location: string; allowRedirect?: boolean; blockedHosts?: string[] };
export function isTopicReadTimeout(reason: string) {
  return /^浏览器操作超时|^浏览器截图超时/.test(reason);
}
export class TopicReadInterrupted extends Error {
  pages: ExternalTopicPage[];
  constructor(message: string, pages: ExternalTopicPage[]) {
    super(message);
    this.pages = pages;
  }
}
// 一轮只用一个浏览器任务；追加页面来自配置搜索入口或已观察链接，不猜选择器或调用接口。
export async function readTopicSources(
  channels: TopicReadTarget[],
  maxScreens: number,
  hooks?: {
    onStart?: (id: string) => void;
    onPage?: (page: ExternalTopicPage) => Promise<void>;
    nextBatch?: (pages: ExternalTopicPage[]) => Promise<TopicReadTarget[]>;
    maxLinks?: number;
    maxCharacters?: number;
  },
): Promise<ExternalTopicPage[]> {
  if (!channels.length && !hooks?.nextBatch) return [];
  const release = await acquireJobLock(path.resolve('data/jobs/topic-sources.pid'));
  if (!release) throw Error('选题来源正在读取，请等待本轮完成');
  try {
    const spaceId = (await runEgo(
      `const t=await taskSpace(${JSON.stringify('选题来源 ' + randomUUID())});console.log('WORKSPACE_RESULT:'+t.spaceId);`,
    )) as number;
    const session = new CollectionSession(spaceId),
      policy = await loadBrowserPolicy(),
      results: ExternalTopicPage[] = [];
    const queue = [...channels];
    for (let index = 0; ; index++) {
      if (index >= queue.length) {
        const next = (await hooks?.nextBatch?.(results)) ?? [];
        if (!next.length) break;
        queue.push(...next);
      }
      const channel = queue[index];
      const result: ExternalTopicPage = {
        id: channel.id,
        url: channel.location,
        text: '',
        screenshots: [],
        links: [],
        error: null,
      };
      hooks?.onStart?.(channel.id);
      try {
        const target = new URL(channel.location);
        if (!['http:', 'https:'].includes(target.protocol)) throw Error('外部渠道位置必须是完整网页地址');
        await pause(randomBetween(policy.platformDelayMs));
        await session.navigate(channel.location, 'body');
        const parts: string[] = [];
        let complete = false;
        for (let i = 0; i < maxScreens; i++) {
          const page = await session.run<{
            url: string;
            text: string;
            bottom: boolean;
            links?: { title: string; url: string }[];
          }>(
            `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(()=>({url:location.href,text:document.body.innerText,bottom:scrollY+innerHeight>=document.documentElement.scrollHeight-4,links:Array.from(document.querySelectorAll('a[href]')).filter(a=>a.getClientRects().length&&a.innerText.trim()).map(a=>({title:a.innerText.trim(),url:a.href}))}))));`,
          );
          if (/\/(?:login|signin|i\/flow\/login)(?:[/?#]|$)/i.test(new URL(page.url).pathname))
            throw Error('需要登录后才能访问');
          if (!['http:', 'https:'].includes(new URL(page.url).protocol)) throw Error('来源跳转到非网页地址');
          if (channel.blockedHosts?.includes(new URL(page.url).hostname)) throw Error('该来源已停用，不采用本页');
          if (!channel.allowRedirect && new URL(page.url).origin !== target.origin)
            throw Error('外部来源跳转到其他站点，请核对渠道地址');
          const risk = policy.riskMarkers.find((m) => page.text.includes(m));
          if (risk) throw Error(`外部选题来源需要处理：${risk}`);
          if (!page.text.trim()) throw Error('外部来源页面没有可读取文字');
          parts.push(page.text);
          result.url = page.url;
          result.text = [...new Set(parts)].join('\n');
          for (const link of page.links ?? []) {
            if (/^https?:\/\//i.test(link.url) && !result.links!.some((l) => l.url === link.url))
              result.links!.push(link);
          }
          if (hooks?.maxLinks) result.links = result.links!.slice(0, hooks.maxLinks);
          result.screenshots.push(
            await session.capture(path.resolve('data/topics', String(spaceId), `${index}-${i}.png`)),
          );
          if (hooks?.maxCharacters && result.text.length > hooks.maxCharacters) {
            result.text = result.text.slice(0, hooks.maxCharacters);
            break;
          }
          if (page.bottom) {
            result.url = page.url;
            result.text = [...new Set(parts)].join('\n');
            complete = true;
            break;
          }
          await session.scroll();
        }
        if (!complete) result.warning = '已达本轮读取上限，仅使用已读取的页面原文';
      } catch (error) {
        const reason = error instanceof Error ? error.message : '外部来源读取失败';
        if (isTopicReadTimeout(reason)) {
          // Stop all browser actions, preserving text observed before the timeout for offline judgment.
          if (result.text.trim()) result.warning = `浏览器读取中断，仅保留已读原文：${reason}`;
          else result.error = reason;
          results.push(result);
          await hooks?.onPage?.(result);
          throw new TopicReadInterrupted(reason, results);
        }
        // 用户接管必须立即停下，不能换页面绕过。
        if (/控制权|不自动重试|浏览器操作超时/.test(reason)) throw error;
        if (result.text.trim() && /网络|页面等待超时/.test(reason))
          result.warning = `读取中断，仅使用此前原文：${reason}`;
        else result.error = reason;
      }
      results.push(result);
      await hooks?.onPage?.(result);
    }
    try {
      await session.run(
        results.some((r) => r.error)
          ? `await task.handOff();console.log('WORKSPACE_RESULT:true');`
          : `await task.finish({keep:[]});console.log('WORKSPACE_RESULT:true');`,
      );
    } catch (error) {
      if (error instanceof Error && isTopicReadTimeout(error.message))
        throw new TopicReadInterrupted(error.message, results);
      throw error;
    }
    return results;
  } finally {
    await release();
  }
}
