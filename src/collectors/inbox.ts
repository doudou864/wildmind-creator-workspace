import { inboxDisplayScope, inboxTimestampInScope, notificationScopes } from './inbox-date.ts';
import { loadConfig } from '../lib/config.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database.ts';
import type { Judgment } from '../ai/structured.ts';
import { CollectionSession, AttentionRequired } from '../browser/collection-session.ts';
import { loadBrowserPolicy, shanghaiDate } from '../browser/policy.ts';
import { inboxReadingSchema, storeInboxReading, inboxSource, refreshThemes } from '../lib/inbox-store.ts';
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
  dmSteps: z.array(z.string()),
  dmRow: z.string(),
  dmTitle: z.string(),
  dmScroll: z.string(),
  dmStrangers: z.string().nullable(),
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
      maxConversations: z.number().int().positive(),
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
      await storeInboxReading(
        db,
        platformId,
        'comment',
        observed.url,
        {
          messages: rows.map((r) => ({
            key: JSON.stringify([r.author, r.body]),
            author: r.author,
            body: r.body,
            sentAt: null,
            contentTitle: null,
            reply: { kind: 'comment', ownReplyFound: null, repliesComplete: false },
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
    if (!source.dmSteps.length) {
      await refreshThemes(db, judgment);
      return;
    }
    await session.navigate(source.url, 'body');
    await session.inspect(platformId, 'html', '', source.url);
    for (const step of source.dmSteps) await session.click(step);
    const names = new Set<string>();
    let dmComplete = false;
    for (let pageIndex = 0; pageIndex < config.maxScreens; pageIndex++) {
      const list = await session.run<{ names: string[]; bottom: boolean }>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const scroll=document.querySelector(cfg.dmScroll);if(!scroll)throw Error('私信列表结构变化');return {names:Array.from(document.querySelectorAll(cfg.dmRow)).map(e=>e.querySelector(cfg.dmTitle)?.textContent?.trim()).filter(Boolean),bottom:scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-4};},${JSON.stringify(source)})));`,
      );
      list.names.forEach((name) => names.add(name));
      if (list.bottom) {
        dmComplete = true;
        break;
      }
      if (names.size >= config.maxConversations) break;
      await session.scroll(source.dmScroll);
    }
    const targets = [...names].filter((n) => n !== source.dmStrangers).slice(0, config.maxConversations);
    // Opening a conversation is read-only; the collector never touches its composer.
    for (const [index, name] of targets.entries()) {
      await session.navigate(source.url, 'body');
      await session.inspect(platformId, 'html', '', source.url);
      for (const step of source.dmSteps) await session.click(step);
      let found = false;
      for (let n = 0; n < config.maxScreens; n++) {
        found = await session.run<boolean>(
          `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(({selector,name})=>Array.from(document.querySelectorAll(selector)).some(e=>e.textContent.trim()===name),${JSON.stringify({ selector: source.dmTitle, name })})));`,
        );
        if (found) break;
        await session.scroll(source.dmScroll);
      }
      if (!found) {
        dmComplete = false;
        continue;
      }
      await session.click(`${source.dmTitle}:text-is(${JSON.stringify(name)})`);
      const filename = `data/inbox/${shanghaiDate()}/${platformId}-dm-${index}.png`;
      await session.capture(filename);
      paths.push(filename);
      await session.inspect(platformId, 'html', '', source.url);
      const snapshot = await session.run<string>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.snapshot()));`,
      );
      const reading = await judgment.read(
        inboxReadingSchema,
        `仅识别已打开的${name}会话中的对方消息，忽略其他列表摘要和推荐内容。key必须是作者+完整原文；日期不完整则时间为null，不猜。未展示完整历史就contextComplete=false；最后一条没有明确证据就latestConfirmed=false。必须注明读取范围。不发消息。\n` +
          snapshot,
        [filename],
      );
      const now = new Date().toISOString();
      reading.messages = reading.messages
        .filter((m) => inboxTimestampInScope(m.sentAt, parameters.startDate, now))
        .map((m) => ({
          ...m,
          context: m.context.filter((c) => inboxTimestampInScope(c.sentAt, parameters.startDate, now)),
        }));
      await storeInboxReading(db, platformId, 'dm', source.url, reading, judgment);
    }
    inboxSource(db, {
      platformId,
      channel: 'dm',
      status: 'failed',
      capturedAt: new Date().toISOString(),
      reason: `已读取${targets.length}个会话的当前可见消息；${dmComplete ? '历史消息和陌生人消息尚未完整核验' : '会话列表未读完'}，不能视为全量成功`,
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
