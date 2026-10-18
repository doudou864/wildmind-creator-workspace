import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { loadConfig } from '../../lib/config.ts';
import { inboxDisplayScope } from '../inbox-date.ts';
import { inboxSource, storeInboxReading, refreshThemes, type incomingMessageSchema } from '../../lib/inbox-store.ts';
export async function collectYoutubeInbox(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      url: z.url(),
      row: z.string(),
      comment: z.string(),
      author: z.string(),
      body: z.string(),
      time: z.string(),
      title: z.string(),
      replies: z.string(),
      scroll: z.string(),
      selfNames: z.array(z.string()),
      maxScreens: z.number().int().positive(),
    })
    .parse(parse(await readFile('config/inbox-youtube.yaml', 'utf8')));
  const { parameters } = await loadConfig();
  const today = shanghaiDate();
  await session.navigate(cfg.url, cfg.row);
  await session.inspect('youtube');
  const buttons = () =>
    session.run<string[]>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll('button')).filter(e=>e.getBoundingClientRect().width>0).map(e=>e.getAttribute('aria-label')??e.textContent.trim()))));`,
    );
  if ((await buttons()).includes('移除过滤条件')) await session.click('loc=role:button[name="移除过滤条件"]');
  if ((await buttons()).includes('相关性最高。按 Enter 键即可修改')) {
    await session.click('loc=role:button[name="相关性最高。按 Enter 键即可修改"]');
    await session.click('text="最新"');
    await session.click('loc=css:button[aria-label="应用"]');
  }
  for (let i = 0; i < 3; i++) {
    const guide = await session.run<boolean>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(()=>Array.from(document.querySelectorAll('[role=dialog]')).some(e=>e.getBoundingClientRect().width>0&&(e.textContent.includes('默认视图')||e.textContent.includes('最相关或最新'))))));`,
    );
    if (!guide) break;
    await session.click('loc=role:button[name="关闭"]');
  }
  const messages = new Map<string, z.infer<typeof incomingMessageSchema>>();
  let complete = false;
  let unknown = false;
  let previous = '';
  for (let n = 0; n < cfg.maxScreens; n++) {
    await session.inspect('youtube', cfg.scroll);
    const data = await session.run<{
      rows: { id: string; author: string; body: string; time: string; title: string; replies: string }[];
      bottom: boolean;
      text: string;
    }>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const scroll=document.querySelector(cfg.scroll);if(!scroll)throw Error('评论滚动区域变化');return {rows:Array.from(document.querySelectorAll(cfg.row)).map(e=>({id:e.querySelector(cfg.comment)?.getAttribute('comment-id')??'',author:e.querySelector(cfg.author)?.textContent.trim()??'',body:e.querySelector(cfg.body)?.textContent.trim()??'',time:e.querySelector(cfg.time)?.textContent.trim()??'',title:e.querySelector(cfg.title)?.textContent.trim()??'',replies:e.querySelector(cfg.replies)?.textContent.trim()??''})),bottom:scroll.scrollTop+scroll.clientHeight>=scroll.scrollHeight-4,text:scroll.innerText};},${JSON.stringify(cfg)})));`,
    );
    if (!data.rows.length) throw Error('评论列表为空，尚未核实是无评论还是加载失败');
    if (data.text.includes('出了点问题')) throw Error('YouTube 评论页面加载失败');
    for (const r of data.rows) {
      if (cfg.selfNames.includes(r.author)) continue;
      const scope = inboxDisplayScope(r.time, today, parameters.startDate);
      if (scope === 'unknown') {
        unknown = true;
        continue;
      }
      if (scope === 'old') continue;
      if (!r.id || !r.body) throw Error('评论正文或原生编号缺失');
      messages.set(r.id, {
        key: 'native:' + r.id,
        author: r.author,
        body: r.body,
        sentAt: null,
        contentTitle: r.title,
        reply: {
          kind: 'comment',
          ownReplyFound: /^0\s*条回复$/.test(r.replies) ? false : null,
          repliesComplete: /^0\s*条回复$/.test(r.replies),
        },
        context: [],
        contextComplete: false,
      });
    }
    const file = `data/inbox/${today}/youtube-comments-${n}.png`;
    await session.capture(file);
    paths.push(file);
    const fingerprint = JSON.stringify(data.rows);
    if (
      data.rows.some((r) => inboxDisplayScope(r.time, today, parameters.startDate) === 'old') ||
      (data.bottom && previous === fingerprint)
    ) {
      complete = true;
      break;
    }
    previous = fingerprint;
    await session.scroll(cfg.scroll);
  }
  await storeInboxReading(
    db,
    'youtube',
    'comment',
    cfg.url,
    {
      messages: [...messages.values()],
      complete: complete && !unknown,
      reason: unknown ? '部分相对日期在起号日边界，未猜测入库' : null,
    },
    judgment,
  );
  inboxSource(db, {
    platformId: 'youtube',
    channel: 'comment',
    status: complete && !unknown ? 'ready' : 'failed',
    capturedAt: new Date().toISOString(),
    reason: unknown
      ? '部分日期无法确认是否在起号日之后'
      : complete
        ? '已读取近期评论；有回复但未展开的评论保持未知'
        : '评论未读完',
  });
  inboxSource(db, {
    platformId: 'youtube',
    channel: 'dm',
    status: 'unavailable',
    capturedAt: new Date().toISOString(),
    reason: '当前账号的 Studio 社区仅提供评论和提及，没有私信入口',
  });
  await refreshThemes(db, judgment);
  return { messages: messages.size, complete: complete && !unknown };
}
