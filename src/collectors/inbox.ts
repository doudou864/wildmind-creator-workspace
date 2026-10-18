import { readCommentEngagement } from './inbox-engagement.ts';
import { inboxDisplayScope, notificationScopes } from './inbox-date.ts';
import { loadConfig } from '../lib/config.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import type { Judgment } from '../ai/structured.ts';
import { CollectionSession, AttentionRequired } from '../browser/collection-session.ts';
import { loadBrowserPolicy, shanghaiDate } from '../browser/policy.ts';
import { storeInboxReading, inboxSource, refreshThemes } from '../lib/inbox-store.ts';
const sourceSchema = z.object({
  id: z.string(),
  url: z.url(),
  commentSteps: z.array(z.string()),
  commentRow: z.string(),
  commentAuthor: z.string(),
  commentBody: z.string(),
  commentTime: z.string(),
  commentScroll: z.string(),
  commentMore: z.string().nullable(),
  ignoredBodies: z.array(z.string()).default([]),
});
export async function collectInbox(
  db: WorkspaceDatabase,
  platformId: string,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const config = z
    .object({
      maxScreens: z.number().int().positive(),
      platforms: z.array(sourceSchema),
    })
    .parse(parse(await readFile('config/inbox-collection.yaml', 'utf8')));
  const { parameters } = await loadConfig();
  const today = shanghaiDate();
  const beforeStart = (value: string) => inboxDisplayScope(value, today, parameters.startDate) === 'old';
  const unknownDates = new Set<string>();
  const source = config.platforms.find((p) => p.id === platformId);
  if (!source) {
    for (const channel of ['comment', 'dm'] as const)
      inboxSource(db, { platformId, channel, status: 'pending', capturedAt: null, reason: '入口尚未完成真实核验' });
    return;
  }
  try {
    await session.navigate(source.url, 'body');
    await session.inspect(platformId, 'html', '', source.url);
    for (const step of source.commentSteps) await session.click(step);
    const seen = new Set<string>();
    let complete = false;
    for (let pageIndex = 0; pageIndex < config.maxScreens; pageIndex++) {
      await session.run(`await page.cdp('Page.bringToFront');console.log('WORKSPACE_RESULT:true');`);
      const exists = await session.run<boolean>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(selector=>!!document.querySelector(selector),${JSON.stringify(source.commentScroll)})));`,
      );
      if (!exists && source.commentSteps[0]) await session.click(source.commentSteps[0]);
      const observed = await session.run<{
        url: string;
        text: string;
        rows: { author: string; body: string; time: string }[];
        more: boolean;
        bottom: boolean;
      }>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const scroll=document.querySelector(cfg.commentScroll);if(!scroll)throw Error('评论区域结构变化');return {url:location.href,text:scroll.textContent,rows:Array.from(document.querySelectorAll(cfg.commentRow)).map(e=>({author:e.querySelector(cfg.commentAuthor)?.textContent?.trim()??'',body:e.querySelector(cfg.commentBody)?.textContent?.trim()??'',time:e.querySelector(cfg.commentTime)?.textContent?.trim()??''})).filter(r=>r.body),more:scroll.textContent.includes('点击加载更多'),bottom:scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-4};},${JSON.stringify(source)})));`,
      );
      const policy = await loadBrowserPolicy();
      const risk = policy.riskMarkers.find((x) => observed.text.includes(x));
      if (risk) throw new AttentionRequired(risk, 'risk');
      if (new URL(observed.url).origin !== new URL(source.url).origin)
        throw new AttentionRequired('互动页面跳转到异常地址', 'login');
      const filename = `data/inbox/${shanghaiDate()}/${platformId}-comments-${pageIndex}.png`;
      await session.capture(filename);
      paths.push(filename);
      await writeFile(filename.replace(/\.png$/, '.json'), JSON.stringify(observed.rows), { mode: 0o600 });
      const reachedStart = observed.rows.some((r) => beforeStart(r.time));
      const scopes = notificationScopes(
        observed.rows.map((r) => r.time),
        today,
        parameters.startDate,
      );
      const rows = observed.rows.filter((r, index) => {
        if (beforeStart(r.time) || source.ignoredBodies.includes(r.body)) return false;
        const key = JSON.stringify([r.author, r.body]);
        if (scopes[index] !== 'recent') {
          unknownDates.add(key);
          return false;
        }
        unknownDates.delete(key);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const engagement = await readCommentEngagement(judgment, filename, rows);
      await storeInboxReading(
        db,
        platformId,
        'comment',
        observed.url,
        {
          messages: rows.map((r, index) => ({
            key: JSON.stringify([r.author, r.body]),
            author: r.author,
            body: r.body,
            sentAt: null,
            contentTitle: null,
            reply: { kind: 'comment', ownReplyFound: null, repliesComplete: false, ...engagement[index] },
            context: [],
            contextComplete: false,
          })),
          complete: false,
          reason: '评论通知已读取；回复串未展开，回复状态未知',
        },
        judgment,
      );
      if (reachedStart || (observed.bottom && !observed.more)) {
        complete = true;
        break;
      }
      if (observed.bottom && observed.more && source.commentMore) await session.click(source.commentMore);
      else await session.scroll(source.commentScroll);
    }
    inboxSource(db, {
      platformId,
      channel: 'comment',
      status: complete && !unknownDates.size ? 'ready' : 'failed',
      capturedAt: new Date().toISOString(),
      reason: unknownDates.size
        ? '部分消息日期无法确定，未入库，需核对日期'
        : complete
          ? '已读起号日以来的通知；回复串未展开，回复状态未知'
          : '达到本轮翻页上限，评论未读完',
    });
    await refreshThemes(db, judgment);
  } catch (error) {
    for (const channel of ['comment', 'dm'] as const)
      inboxSource(db, {
        platformId,
        channel,
        status: 'failed',
        capturedAt: new Date().toISOString(),
        reason: error instanceof Error ? error.message : '互动采集失败',
      });
    throw error;
  }
}
