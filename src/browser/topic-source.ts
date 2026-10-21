import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { runEgo } from './ego.ts';
import { CollectionSession } from './collection-session.ts';
import { loadBrowserPolicy, pause, randomBetween } from './policy.ts';
import { acquireJobLock } from '../jobs/lock.ts';
export type ExternalTopicPage = { id: string; url: string; text: string; screenshots: string[]; error: string | null };
// 一轮只用一个浏览器任务，逐个读取外部渠道；只看文档指定页面，不猜选择器或调用接口。
export async function readTopicSources(
  channels: { id: string; location: string }[],
  maxScreens: number,
): Promise<ExternalTopicPage[]> {
  if (!channels.length) return [];
  const release = await acquireJobLock(path.resolve('data/jobs/topic-sources.pid'));
  if (!release) throw Error('选题来源正在读取，请等待本轮完成');
  try {
    const spaceId = (await runEgo(
      `const t=await taskSpace(${JSON.stringify('选题来源 ' + randomUUID())});console.log('WORKSPACE_RESULT:'+t.spaceId);`,
    )) as number;
    const session = new CollectionSession(spaceId),
      policy = await loadBrowserPolicy(),
      results: ExternalTopicPage[] = [];
    for (const [index, channel] of channels.entries()) {
      const result: ExternalTopicPage = {
        id: channel.id,
        url: channel.location,
        text: '',
        screenshots: [],
        error: null,
      };
      try {
        const target = new URL(channel.location);
        if (!['http:', 'https:'].includes(target.protocol)) throw Error('外部渠道位置必须是完整网页地址');
        await pause(randomBetween(policy.platformDelayMs));
        await session.navigate(channel.location, 'body');
        const parts: string[] = [];
        let complete = false;
        for (let i = 0; i < maxScreens; i++) {
          const page = await session.run<{ url: string; text: string; bottom: boolean }>(
            `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(()=>({url:location.href,text:document.body.innerText,bottom:scrollY+innerHeight>=document.documentElement.scrollHeight-4}))));`,
          );
          if (new URL(page.url).origin !== target.origin) throw Error('外部来源跳转到其他站点，请核对渠道地址');
          const risk = policy.riskMarkers.find((m) => page.text.includes(m));
          if (risk) throw Error(`外部选题来源需要处理：${risk}`);
          if (!page.text.trim()) throw Error('外部来源页面没有可读取文字');
          parts.push(page.text);
          result.screenshots.push(
            await session.capture(path.resolve('data/topics', String(spaceId), `${index}-${i}.png`)),
          );
          if (page.bottom) {
            result.url = page.url;
            result.text = [...new Set(parts)].join('\n');
            complete = true;
            break;
          }
          await session.scroll();
        }
        if (!complete) throw Error('外部来源超过单次页面读取上限，本轮不使用不完整来源');
      } catch (error) {
        const reason = error instanceof Error ? error.message : '外部来源读取失败';
        // 用户接管必须立即停下，不能换页面绕过。
        if (/控制权|不自动重试|浏览器操作超时/.test(reason)) throw error;
        result.error = reason;
      }
      results.push(result);
    }
    await session.run(
      results.some((r) => r.error)
        ? `await task.handOff();console.log('WORKSPACE_RESULT:true');`
        : `await task.finish({keep:[]});console.log('WORKSPACE_RESULT:true');`,
    );
    return results;
  } finally {
    await release();
  }
}
