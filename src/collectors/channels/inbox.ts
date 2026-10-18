import { readCommentEngagement } from '../inbox-engagement.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { loadConfig } from '../../lib/config.ts';
import { inboxDate, inboxTimestampInScope } from '../inbox-date.ts';
import { inboxSource, storeInboxReading, refreshThemes } from '../../lib/inbox-store.ts';
const schema = z.object({
  url: z.url(),
  host: z.string(),
  feed: z.string(),
  title: z.string(),
  published: z.string(),
  feedScroll: z.string(),
  commentScroll: z.string(),
  comment: z.string(),
  main: z.string(),
  author: z.string(),
  time: z.string(),
  body: z.string(),
  self: z.string(),
  ownReply: z.string(),
  more: z.string(),
  moreText: z.string(),
  maxScreens: z.number().int().positive(),
});
export async function collectChannelsComments(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = schema.parse(parse(await readFile('config/inbox-channels.yaml', 'utf8')));
  const { parameters } = await loadConfig(),
    today = shanghaiDate();
  const read = <T>(expression: string) =>
    session.run<T>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const root=document.querySelector(cfg.host)?.shadowRoot;if(!root)throw Error('评论区域未加载');${expression}},${JSON.stringify(cfg)})));`,
    );
  await session.navigate(cfg.url, 'text="评论管理"');
  await session.inspect('channels', 'html', '', cfg.url);
  const feeds = new Map<string, string>();
  let listComplete = false;
  for (let n = 0; n < cfg.maxScreens; n++) {
    const view = await read<{ rows: { title: string; date: string }[]; bottom: boolean }>(
      `const s=root.querySelector(cfg.feedScroll);return {rows:Array.from(root.querySelectorAll(cfg.feed)).map(e=>({title:e.querySelector(cfg.title)?.textContent.trim()??'',date:e.querySelector(cfg.published)?.textContent.trim()??''})),bottom:s.scrollTop+s.clientHeight>=s.scrollHeight-4};`,
    );
    if (!view.rows.length) throw Error('作品列表为空，尚不能确认是否加载完成');
    for (const row of view.rows) {
      const d = inboxDate(row.date, today);
      if (!d) throw Error('作品日期不明');
      if (d >= parameters.startDate && d <= today) feeds.set(row.title, d);
    }
    if (view.bottom || view.rows.some((r) => (inboxDate(r.date, today) ?? today) < parameters.startDate)) {
      listComplete = true;
      break;
    }
    await session.scrollShadow(cfg.host, cfg.feedScroll);
  }
  let complete = listComplete,
    count = 0;
  for (const [index, [title]] of [...feeds].entries()) {
    for (let n = 0; n < cfg.maxScreens; n++) {
      const position = await session.run<{ visible: boolean; direction: number }>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const root=document.querySelector(cfg.host).shadowRoot;const e=Array.from(root.querySelectorAll(cfg.title)).find(e=>e.textContent.trim()===cfg.text);if(!e)return {visible:false,direction:1};const r=e.getBoundingClientRect(),s=root.querySelector(cfg.feedScroll).getBoundingClientRect();return {visible:r.top>=s.top&&r.bottom<=Math.min(s.bottom,innerHeight),direction:r.top<s.top?-1:1};},${JSON.stringify({ ...cfg, text: title })})));`,
      );
      if (position.visible) break;
      if (n === cfg.maxScreens - 1) throw Error('未能滚动到目标作品');
      await session.scrollShadow(cfg.host, cfg.feedScroll, position.direction);
    }
    await session.clickShadow(cfg.host, cfg.title, title);
    const seen = new Map<string, string>();
    let seekingReplies = false;
    let previous = '',
      stable = 0,
      finished = false;
    for (let n = 0; n < cfg.maxScreens; n++) {
      await session.inspect('channels', 'html', '', cfg.url);
      const view = await read<{
        rows: {
          author: string;
          body: string;
          time: string;
          self: boolean;
          ownReply: boolean;
          nested: boolean;
          more: boolean;
        }[];
        bottom: boolean;
        moreText: string | null;
        remaining: number;
      }>(
        `const s=root.querySelector(cfg.commentScroll);if(!s)throw Error('评论列表未加载');const b=s.getBoundingClientRect();return {rows:Array.from(s.querySelectorAll(cfg.comment)).map(e=>{const m=e.querySelector(cfg.main);return {author:m?.querySelector(cfg.author)?.textContent.trim()??'',body:m?.querySelector(cfg.body)?.textContent.trim()??'',time:m?.querySelector(cfg.time)?.textContent.trim()??'',self:!!m?.querySelector(cfg.self),ownReply:!!e.querySelector(cfg.ownReply),nested:!!e.parentElement.closest(cfg.comment),more:!!e.querySelector(cfg.more)};}),bottom:s.scrollTop+s.clientHeight>=s.scrollHeight-4,remaining:Array.from(s.querySelectorAll(cfg.more)).filter(e=>e.textContent.trim()===cfg.moreText).length,moreText:Array.from(s.querySelectorAll(cfg.more)).find(e=>{const r=e.getBoundingClientRect();return r.top>=b.top&&r.bottom<=Math.min(b.bottom,innerHeight)&&e.textContent.trim()===cfg.moreText;})?.textContent.trim()??null};`,
      );
      const rows = view.rows
        .filter((r) => r.body && !r.self)
        .flatMap((r) => {
          const d = inboxDate(r.time, today),
            t = r.time.match(/(\d{2}:\d{2})/),
            sentAt = d && t ? `${d}T${t[1]}:00+08:00` : null;
          if (!sentAt) {
            complete = false;
            return [];
          }
          if (!inboxTimestampInScope(sentAt, parameters.startDate, new Date().toISOString())) return [];
          const key = 'scoped:' + JSON.stringify([title, r.author, r.time, r.body]);
          const evidence = JSON.stringify([r.ownReply, r.nested, r.more]);
          if (seen.get(key) === evidence) return [];
          if (!seen.has(key)) count++;
          seen.set(key, evidence);
          return [
            {
              key,
              author: r.author,
              body: r.body,
              sentAt,
              contentTitle: title,
              reply: {
                kind: 'comment' as const,
                ownReplyFound: r.nested ? null : r.ownReply,
                repliesComplete: !r.nested && !r.more,
              },
              context: [],
              contextComplete: false,
            },
          ];
        });
      if (rows.length) {
        const file = `data/inbox/${today}/channels-comments-${index}-${n}.png`;
        await session.capture(file);
        paths.push(file);
        await writeFile(file + '.json', JSON.stringify(view.rows), { mode: 0o600 });
        const engagement = await readCommentEngagement(judgment, file, rows);
        await storeInboxReading(
          db,
          'channels',
          'comment',
          cfg.url,
          {
            messages: rows.map((r, i) => ({ ...r, reply: { ...r.reply, ...engagement[i] } })),
            complete: false,
            reason: '正在读取评论列表及回复',
          },
          judgment,
        );
      }
      const fingerprint = JSON.stringify(view.rows);
      stable = view.bottom && fingerprint === previous ? stable + 1 : 0;
      previous = fingerprint;
      if (view.moreText) {
        await session.clickShadow(cfg.host, cfg.more, view.moreText, true);
        stable = 0;
        continue;
      }
      if (view.bottom && view.remaining > 0) seekingReplies = true;
      if (seekingReplies && view.remaining > 0) {
        await session.scrollShadow(cfg.host, cfg.commentScroll, -1);
        stable = 0;
        continue;
      }
      if (!view.remaining) seekingReplies = false;
      if (stable >= 2) {
        finished = true;
        break;
      }
      await session.scrollShadow(cfg.host, cfg.commentScroll);
    }
    complete &&= finished;
  }
  inboxSource(db, {
    platformId: 'channels',
    channel: 'comment',
    status: complete ? 'ready' : 'failed',
    capturedAt: new Date().toISOString(),
    reason: complete ? '起号日以来作品的评论已读取；回复证据不足时保持未知' : '评论列表或日期尚未核验完整',
  });
  await refreshThemes(db, judgment);
  return { posts: feeds.size, messages: count, complete };
}
