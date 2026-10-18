import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { loadConfig } from '../../lib/config.ts';
import { inboxDate } from '../inbox-date.ts';
import { inboxSource, storeInboxReading, refreshThemes } from '../../lib/inbox-store.ts';
export async function collectXiaohongshuDM(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      url: z.url(),
      contact: z.string(),
      name: z.string(),
      time: z.string(),
      listScroll: z.string(),
      messageScroll: z.string(),
      message: z.string(),
      divider: z.string(),
      text: z.string(),
      self: z.string(),
      maxScreens: z.number().int().positive(),
      maxConversations: z.number().int().positive(),
    })
    .parse(parse(await readFile('config/inbox-xiaohongshu.yaml', 'utf8')));
  const { parameters } = await loadConfig();
  const today = shanghaiDate();
  await session.navigate(cfg.url, cfg.contact);
  await session.inspect('xiaohongshu', 'html', '', cfg.url);
  const contacts = new Map<string, string>();
  let listComplete = false;
  for (let i = 0; i < cfg.maxScreens; i++) {
    const list = await session.run<{ rows: { name: string; time: string }[]; bottom: boolean }>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const s=document.querySelector(cfg.listScroll);if(!s)throw Error('私信列表结构变化');return {rows:Array.from(document.querySelectorAll(cfg.contact)).map(e=>({name:e.querySelector(cfg.name)?.textContent.trim()??'',time:e.querySelector(cfg.time)?.textContent.trim()??''})),bottom:s.scrollTop+s.clientHeight>=s.scrollHeight-4};},${JSON.stringify(cfg)})));`,
    );
    for (const r of list.rows) {
      const date = inboxDate(r.time, today);
      if (!date) throw Error('会话日期无法确定，未读取消息');
      if (date >= parameters.startDate && r.name) contacts.set(r.name, date);
    }
    if (list.bottom || list.rows.some((r) => (inboxDate(r.time, today) ?? today) < parameters.startDate)) {
      listComplete = true;
      break;
    }
    if (contacts.size >= cfg.maxConversations) break;
    await session.scroll(cfg.listScroll);
  }
  let count = 0;
  let unknownDates = false;
  let allComplete = listComplete && contacts.size <= cfg.maxConversations;
  for (const [index, [name]] of [...contacts].slice(0, cfg.maxConversations).entries()) {
    await session.click(`${cfg.name}:text-is(${JSON.stringify(name)})`);
    let previous = '';
    let historyComplete = false;
    let latestId: string | null = null;
    const known = new Map<string, { id: string; body: string; date: string | null; time: string; self: boolean }>();
    for (let n = 0; n < cfg.maxScreens; n++) {
      await session.inspect('xiaohongshu', 'html', '', cfg.url);
      const view = await session.run<{
        rows: { id: string; body: string; time: string; self: boolean }[];
        top: boolean;
        bottom: boolean;
      }>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const s=document.querySelector(cfg.messageScroll);if(!s)throw Error('私信内容结构变化');let time='';const rows=[];for(const e of s.children){if(e.matches(cfg.divider))time=e.textContent.trim();else if(e.matches(cfg.message))rows.push({id:e.getAttribute('data-message-id'),body:e.querySelector(cfg.text)?.textContent.trim()??'[非文字消息]',time,self:!!e.querySelector(cfg.self)});}return {rows,top:s.scrollTop<=0,bottom:s.scrollTop+s.clientHeight>=s.scrollHeight-4};},${JSON.stringify(cfg)})));`,
      );
      if (n === 0 && view.bottom) latestId = view.rows.at(-1)?.id ?? null;
      for (const r of view.rows) {
        const date = inboxDate(r.time, today);
        if (!date || date > today) unknownDates = true;
        if (date && date >= parameters.startDate && date <= today) known.set(r.id, { ...r, date });
      }
      const fingerprint = JSON.stringify(view.rows);
      if (
        view.rows.some((r) => {
          const d = inboxDate(r.time, today);
          return d && d < parameters.startDate;
        }) ||
        (view.top && previous === fingerprint)
      ) {
        historyComplete = true;
        break;
      }
      previous = fingerprint;
      await session.scroll(cfg.messageScroll, -1);
    }
    allComplete &&= historyComplete && !unknownDates;
    const file = `data/inbox/${today}/xiaohongshu-dm-${index}.png`;
    await session.capture(file);
    paths.push(file);
    await session.archiveSnapshot(file + '.txt');
    const rows = [...known.values()].sort(
      (a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.time.localeCompare(b.time),
    );
    const at = (r: (typeof rows)[number]) => {
      const t = r.time.match(/(\d{2}:\d{2})/);
      return r.date && t ? `${r.date}T${t[1]}:00+08:00` : null;
    };
    const last = latestId ? known.get(latestId) : undefined;
    const context = rows.map((r) => ({
      id: r.id,
      sender: r.self ? ('self' as const) : ('other' as const),
      author: r.self ? '我' : name,
      body: r.body,
      sentAt: at(r),
    }));
    const incoming = rows
      .filter((r) => !r.self && r.body !== '[非文字消息]')
      .map((r) => ({
        key: 'native:' + r.id,
        author: name,
        body: r.body,
        sentAt: at(r),
        contentTitle: null,
        reply: {
          kind: 'dm' as const,
          conversationId: name,
          latestConfirmed: !!last && last.body !== '[非文字消息]' && at(last) !== null,
          lastSender:
            !last || last.body === '[非文字消息]'
              ? ('unknown' as const)
              : last.self
                ? ('self' as const)
                : ('other' as const),
          lastMessageAt: last ? at(last) : null,
        },
        context,
        contextComplete: historyComplete && !unknownDates,
      }));
    await storeInboxReading(
      db,
      'xiaohongshu',
      'dm',
      cfg.url,
      {
        messages: incoming,
        complete: historyComplete && !unknownDates,
        reason: '时间按页面分组显示；仅首次打开已在底部且最后一条可确认时判断回复状态',
      },
      judgment,
    );
    count += incoming.length;
  }
  inboxSource(db, {
    platformId: 'xiaohongshu',
    channel: 'dm',
    status: allComplete ? 'ready' : 'failed',
    capturedAt: new Date().toISOString(),
    reason: unknownDates
      ? '部分消息日期不明，未入库，范围尚未核实'
      : allComplete
        ? '起号日以来文字私信已读取；图片保留截图，证据不足时回复状态未知'
        : '达到范围上限，私信未读完',
  });
  await refreshThemes(db, judgment);
  return { conversations: contacts.size, messages: count, complete: allComplete };
}
