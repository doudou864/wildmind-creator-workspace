import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { loadConfig } from '../../lib/config.ts';
import { inboxDate, notificationScopes } from '../inbox-date.ts';
import { inboxSource, storeInboxReading, refreshThemes } from '../../lib/inbox-store.ts';
type Row = { index: number; body: string; time: string; self: boolean; first: boolean };
/** The visible chat is rotated: DOM order is newest first; date dividers apply from older to newer. */
export function datedDouyinMessages(rows: Row[], today: string, startDate: string, recentConversation: boolean) {
  let time = '';
  const dated = [...rows]
    .sort((a, b) => b.index - a.index)
    .map((row) => {
      if (row.time) time = row.time;
      return { ...row, time, exactTime: row.time };
    })
    .reverse();
  const scopes = notificationScopes(
    dated.map((r) => r.time),
    today,
    startDate,
  );
  // A one-message conversation's date was bounded in the newest-first contact list.
  if (dated.length === 1 && dated[0].first && recentConversation && /^(周|星期)[日天一二三四五六]$/.test(dated[0].time))
    scopes[0] = 'recent';
  return dated.map((row, index) => {
    const date = inboxDate(row.time, today),
      clock = row.exactTime.match(/(?:^|\s)([0-2]\d:[0-5]\d)(?:$|\s)/);
    return { ...row, scope: scopes[index], sentAt: date && clock ? `${date}T${clock[1]}:00+08:00` : null };
  });
}
export async function collectDouyinDM(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      url: z.url(),
      open: z.string().min(1),
      contact: z.string().min(1),
      name: z.string().min(1),
      time: z.string().min(1),
      personal: z.string().min(1),
      pinned: z.string().min(1),
      listScroll: z.string().min(1),
      strangerRoot: z.string().min(1),
      strangerOpen: z.string().min(1),
      strangerTime: z.string().min(1),
      strangerScroll: z.string().min(1),
      back: z.string().min(1),
      messageScroll: z.string().min(1),
      message: z.string().min(1),
      messageTime: z.string().min(1),
      messageText: z.string().min(1),
      self: z.string().min(1),
      first: z.string().min(1),
      maxScreens: z.number().int().positive(),
      maxConversations: z.number().int().positive(),
    })
    .parse(parse(await readFile('config/inbox-douyin.yaml', 'utf8')));
  const { parameters } = await loadConfig(),
    today = shanghaiDate();
  await session.navigate(cfg.url, 'body');
  await session.click(cfg.open);
  let count = 0,
    visited = 0,
    complete = true,
    strangerRecent = false;
  for (const stranger of [false, true]) {
    if (stranger) {
      const exists = await session.run<boolean>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(s=>!!document.querySelector(s),${JSON.stringify(cfg.strangerOpen)})));`,
      );
      if (!exists) break;
      await session.click(cfg.strangerOpen);
    }
    const contacts = new Map<string, boolean>();
    let listComplete = false;
    for (let n = 0; n < cfg.maxScreens; n++) {
      await session.inspect('douyin', 'html', '', cfg.url);
      const view = await session.run<{
        rows: { name: string; time: string; personal: boolean; pinned: boolean; stranger: boolean }[];
        bottom: boolean;
      }>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const s=document.querySelector(cfg.scroll);if(!s)throw Error('私信列表未加载');return {rows:Array.from(s.querySelectorAll(cfg.contact+','+cfg.strangerRoot)).map(e=>({name:e.querySelector(cfg.name)?.textContent.trim()??'',time:e.querySelector(cfg.time)?.textContent.trim()??e.querySelector(cfg.strangerTime)?.textContent.trim()??'',personal:!!e.querySelector(cfg.personal),pinned:e.matches(cfg.pinned),stranger:e.matches(cfg.strangerRoot)})),bottom:s.scrollTop+s.clientHeight>=s.scrollHeight-4};},${JSON.stringify({ ...cfg, scroll: stranger ? cfg.strangerScroll : cfg.listScroll })})));`,
      );
      const ordered = view.rows.filter((r) => !r.pinned),
        prefix: string[] = stranger && strangerRecent ? ['今天'] : [];
      const scopes = notificationScopes([...prefix, ...ordered.map((r) => r.time)], today, parameters.startDate).slice(
        prefix.length,
      );
      for (const row of view.rows) {
        const scope = row.pinned
          ? notificationScopes([row.time], today, parameters.startDate)[0]
          : scopes[ordered.indexOf(row)];
        if (row.stranger) strangerRecent = scope === 'recent';
        if (!row.personal) continue;
        if (scope === 'unknown') {
          complete = false;
          continue;
        }
        if (scope === 'recent') contacts.set(row.name, true);
      }
      if (view.bottom || scopes.includes('old')) {
        listComplete = true;
        break;
      }
      await session.scroll(stranger ? cfg.strangerScroll : cfg.listScroll);
    }
    complete &&= listComplete && contacts.size <= cfg.maxConversations;
    for (const [name, recent] of [...contacts].slice(0, cfg.maxConversations)) {
      await session.click(`${cfg.name}:text-is(${JSON.stringify(name)})`);
      visited++;
      const known = new Map<number, Row>();
      let historyComplete = false,
        previous = '',
        stable = 0,
        latestConfirmed = false;
      for (let n = 0; n < cfg.maxScreens; n++) {
        await session.inspect('douyin', 'html', '', cfg.url);
        const view = await session.run<{ rows: Row[]; latest: boolean; oldest: boolean }>(
          `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const s=document.querySelector(cfg.messageScroll);if(!s)throw Error('私信正文未加载');const text=n=>n.nodeType===3?n.textContent:n.nodeName==='IMG'?n.getAttribute('alt')??'':Array.from(n.childNodes).map(text).join('');return {rows:Array.from(s.querySelectorAll(cfg.message)).map(e=>({index:Number(e.parentElement.getAttribute('data-index')),body:e.querySelector(cfg.messageText)?text(e.querySelector(cfg.messageText)).trim():'',time:e.querySelector(cfg.messageTime)?.textContent.trim()??'',self:!!e.querySelector(cfg.self),first:e.matches(cfg.first)})),latest:s.scrollTop<=4,oldest:s.scrollTop+s.clientHeight>=s.scrollHeight-4};},${JSON.stringify(cfg)})));`,
        );
        if (n === 0) latestConfirmed = view.latest;
        view.rows.forEach((r) => known.set(r.index, r));
        const dated = datedDouyinMessages([...known.values()], today, parameters.startDate, recent);
        const fingerprint = JSON.stringify(view.rows);
        stable = view.oldest && fingerprint === previous ? stable + 1 : 0;
        previous = fingerprint;
        if (dated.some((r) => r.scope === 'old' || r.first) || stable >= 2) {
          historyComplete = true;
          break;
        }
        await session.scroll(cfg.messageScroll, -1);
      }
      const rows = datedDouyinMessages([...known.values()], today, parameters.startDate, recent),
        last = rows[0];
      const unknown = rows.some((r) => r.body && r.scope === 'unknown');
      complete &&= historyComplete && !unknown;
      const file = `data/inbox/${today}/douyin-private-${visited}.png`;
      await session.capture(file);
      paths.push(file);
      await session.archiveSnapshot(file + '.txt');
      const context = rows
        .filter((r) => r.body && r.scope === 'recent')
        .map((r) => ({
          id: String(r.index),
          sender: r.self ? ('self' as const) : ('other' as const),
          author: r.self ? '我' : name,
          body: r.body,
          sentAt: r.sentAt,
        }));
      const incoming = rows
        .filter((r) => r.body && !r.self && r.scope === 'recent')
        .map((r) => ({
          key: JSON.stringify([name, r.body]),
          author: name,
          body: r.body,
          sentAt: r.sentAt,
          contentTitle: null,
          reply: {
            kind: 'dm' as const,
            conversationId: name,
            latestConfirmed: latestConfirmed && !!last?.body && !!last.sentAt,
            lastSender: !last?.body ? ('unknown' as const) : last.self ? ('self' as const) : ('other' as const),
            lastMessageAt: last?.sentAt ?? null,
          },
          context,
          contextComplete: historyComplete && !unknown,
        }));
      await storeInboxReading(
        db,
        'douyin',
        'dm',
        cfg.url,
        {
          messages: incoming,
          complete: historyComplete && !unknown,
          reason: '仅保留起号日后的文字私信；非文字消息保留截图，日期不足时回复状态未知',
        },
        judgment,
      );
      count += incoming.length;
      await session.click(cfg.back);
    }
  }
  inboxSource(db, {
    platformId: 'douyin',
    channel: 'dm',
    status: complete ? 'ready' : 'failed',
    capturedAt: new Date().toISOString(),
    reason: complete
      ? '近期个人私信和陌生人文字消息已读取；群聊不纳入，非文字留截图，具体时间不明则回复状态未知'
      : '部分日期或列表范围无法确认，未把旧消息交给分类，尚未全量完成',
  });
  await refreshThemes(db, judgment);
  return { conversations: visited, messages: count, complete };
}
