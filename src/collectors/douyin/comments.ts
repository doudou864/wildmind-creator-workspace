import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parse } from 'yaml';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { posts } from '../../db/schema.ts';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { loadConfig } from '../../lib/config.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { sinceStartDate } from '../../core/collection.ts';
import { inboxDate, inboxDisplayScope } from '../inbox-date.ts';
import { inboxSource, storeInboxReading, refreshThemes } from '../../lib/inbox-store.ts';
export function exactCommentCount(value: string) {
  return /^\d+$/.test(value.trim()) ? Number(value) : null;
}
export async function collectDouyinComments(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      platformId: z.string(),
      listUrl: z.url(),
      search: z.string(),
      searchSubmit: z.string(),
      title: z.string(),
      tab: z.string(),
      row: z.string(),
      main: z.string(),
      author: z.string(),
      time: z.string(),
      body: z.string(),
      likes: z.string(),
      expand: z.string(),
      reply: z.string(),
      owner: z.string(),
      endText: z.string(),
      maxScreens: z.number().int().positive(),
    })
    .parse(parse(await readFile('config/inbox-douyin-comments.yaml', 'utf8')));
  const { parameters } = await loadConfig(),
    now = new Date(),
    today = shanghaiDate(now);
  const targets = db.db
    .select()
    .from(posts)
    .where(eq(posts.platformId, cfg.platformId))
    .all()
    .filter((p) => p.publishedAt && sinceStartDate(p.publishedAt, parameters.startDate, now) && !p.removed);
  type Row = {
    author: string;
    body: string;
    time: string;
    likes: string;
    replies: { author: string; body: string; time: string; owner: boolean }[];
    expand: string;
  };
  let total = 0;
  for (const post of targets) {
    await session.navigate(cfg.listUrl, cfg.search);
    await session.fill(cfg.search, post.title.split('#')[0].trim());
    await session.click(cfg.searchSubmit);
    await session.run(
      `await page.waitForSelector(${JSON.stringify(cfg.title)},{timeout:15000});const matches=await page.evaluate(c=>Array.from(document.querySelectorAll(c.selector)).filter(e=>e.textContent.trim()===c.title).length,${JSON.stringify({ selector: cfg.title, title: post.title })});if(matches!==1)throw Error('搜索结果未唯一匹配作品，未读取评论');console.log('WORKSPACE_RESULT:true');`,
    );
    const detail = await session.openDetail(post.title, cfg.title);
    await detail.click(cfg.tab);
    await detail.run(
      `await page.waitForFunction(c=>document.querySelector(c.row)||document.body.innerText.includes(c.endText),${JSON.stringify(cfg)}, {timeout:15000});console.log('WORKSPACE_RESULT:true');`,
    );
    const rows = new Map<string, Row>();
    let complete = false;
    for (let n = 0; n < cfg.maxScreens; n++) {
      await detail.inspect(cfg.platformId, 'html', '', cfg.listUrl);
      // Expand only read-only reply controls. Never use the Reply/Delete/Like buttons.
      const buttons = await detail.run<number[]>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(c=>Array.from(document.querySelectorAll(c.row)).flatMap((e,i)=>{const b=e.querySelector(c.main)?.querySelector(c.expand);return b&&/^查看\\d+条回复$/.test(b.textContent.trim())?[i]:[]}),${JSON.stringify(cfg)})));`,
      );
      for (const index of buttons) {
        await detail.click(
          `${cfg.row}:nth-child(${index + 1}) ${cfg.main.replace(':scope', '')} ${cfg.expand.replace(':scope', '')}`,
        );
        await detail.run(
          `await page.waitForFunction(c=>{const m=document.querySelectorAll(c.row)[c.index]?.querySelector(c.main);return m?.querySelector(c.expand)?.textContent.trim()==='收起'},${JSON.stringify({ ...cfg, index })},{timeout:15000});console.log('WORKSPACE_RESULT:true');`,
        );
      }
      const view = await detail.run<{ rows: Row[]; end: boolean; url: string }>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(c=>({url:location.href,end:document.body.innerText.includes(c.endText),rows:Array.from(document.querySelectorAll(c.row)).map(e=>{const m=e.querySelector(c.main);const text=(s)=>m?.querySelector(s)?.textContent?.trim()??'';return {author:text(c.author),body:text(c.body),time:text(c.time),likes:text(c.likes),expand:text(c.expand),replies:Array.from(m?.querySelectorAll(c.reply)??[]).map(r=>{const x=r.querySelector(c.main);return {author:x?.querySelector(c.author)?.textContent?.trim()??'',body:x?.querySelector(c.body)?.textContent?.trim()??'',time:x?.querySelector(c.time)?.textContent?.trim()??'',owner:r.querySelector(c.owner)?.textContent?.trim()==='作者'}})}})}),${JSON.stringify(cfg)})));`,
      );
      for (const r of view.rows) if (r.body) rows.set(JSON.stringify([r.author, r.body]), r);
      const file = `data/inbox/${today}/douyin-manage-${post.id}-${randomUUID()}.png`;
      await detail.capture(file);
      paths.push(file);
      if (view.end) {
        complete = true;
        break;
      }
      await detail.scroll();
    }
    if (!complete) throw Error(`《${post.title}》评论尚未读到末尾，本轮不覆盖该作品评论`);
    if ([...rows.values()].some((r) => inboxDisplayScope(r.time, today, parameters.startDate) === 'unknown'))
      throw Error('评论日期无法确认，未更新这条作品');
    const url = await detail.run<string>(`console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.url()));`);
    const incoming = [...rows.values()]
      .filter((r) => inboxDisplayScope(r.time, today, parameters.startDate) === 'recent')
      .map((r) => {
        const date = inboxDate(r.time, today),
          clock = r.time.match(/\d{2}:\d{2}/)?.[0];
        const repliesComplete = !r.expand || r.expand === '收起';
        return {
          key: JSON.stringify([r.author, r.body]),
          author: r.author,
          body: r.body,
          sentAt: date && clock ? `${date}T${clock}:00+08:00` : null,
          contentTitle: post.title,
          reply: {
            kind: 'comment' as const,
            ownReplyFound: r.replies.some((x) => x.owner) ? true : repliesComplete ? false : null,
            repliesComplete,
            likes: exactCommentCount(r.likes),
            replyCount: repliesComplete ? r.replies.length : null,
          },
          context: r.replies.map((x, i) => ({
            id: String(i),
            author: x.author,
            body: x.body,
            sender: x.owner ? ('self' as const) : ('other' as const),
            sentAt: null,
          })),
          contextComplete: repliesComplete,
        };
      });
    await storeInboxReading(
      db,
      cfg.platformId,
      'comment',
      url,
      { messages: incoming, complete: true, reason: '作品评论管理页已读至末尾' },
      judgment,
    );
    total += incoming.length;
    await detail.close();
  }
  inboxSource(db, {
    platformId: cfg.platformId,
    channel: 'comment',
    status: 'ready',
    capturedAt: new Date().toISOString(),
    reason: '已建档作品评论管理页已读取',
  });
  await refreshThemes(db, judgment);
  return { messages: total, works: targets.length };
}
