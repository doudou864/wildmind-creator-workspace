import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { messages } from '../../db/schema.ts';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { loadConfig } from '../../lib/config.ts';
import { inboxDate, inboxTimestampInScope } from '../inbox-date.ts';
import { inboxSource, storeInboxReading, refreshThemes } from '../../lib/inbox-store.ts';
export async function collectChannelsDM(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      url: z.url(),
      host: z.string(),
      tabs: z.array(z.string()),
      tabSelector: z.string(),
      contact: z.string(),
      name: z.string(),
      contactName: z.string(),
      time: z.string(),
      preview: z.string(),
      listScroll: z.string(),
      messageScroll: z.string(),
      message: z.string(),
      body: z.string(),
      self: z.string(),
      maxScreens: z.number().int().positive(),
    })
    .parse(parse(await readFile('config/inbox-channels-dm.yaml', 'utf8')));
  const { parameters } = await loadConfig(),
    today = shanghaiDate();
  const read = <T>(expression: string) =>
    session.run<T>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const root=document.querySelector(cfg.host)?.shadowRoot;if(!root)throw Error('私信内容区域未加载');${expression}},${JSON.stringify(cfg)})));`,
    );
  await session.navigate(cfg.url, 'text="私信管理"');
  let count = 0,
    unknownHistory = false,
    complete = true;
  for (const [tabIndex, tab] of cfg.tabs.entries()) {
    await session.clickShadow(cfg.host, cfg.tabSelector, tab);
    const contacts = new Map<string, { name: string; time: string; preview: string }>();
    let listComplete = false;
    for (let n = 0; n < cfg.maxScreens; n++) {
      const view = await read<{ rows: { name: string; time: string; preview: string }[]; bottom: boolean }>(
        `const s=root.querySelector(cfg.listScroll);return {rows:Array.from(root.querySelectorAll(cfg.contact)).map(e=>({name:e.querySelector(cfg.contactName)?.textContent.trim()??'',time:e.querySelector(cfg.time)?.textContent.trim()??'',preview:e.querySelector(cfg.preview)?.textContent.trim()??''})),bottom:!s||s.scrollTop+s.clientHeight>=s.scrollHeight-4};`,
      );
      for (const r of view.rows) {
        const d = inboxDate(r.time, today);
        if (!d) {
          complete = false;
          continue;
        }
        if (d >= parameters.startDate && d <= today) contacts.set(r.name, r);
      }
      if (view.bottom || view.rows.some((r) => (inboxDate(r.time, today) ?? today) < parameters.startDate)) {
        listComplete = true;
        break;
      }
      await session.scrollShadow(cfg.host, cfg.listScroll);
    }
    complete &&= listComplete;
    for (const [index, contact] of [...contacts.values()].entries()) {
      // Position the known contact with ordinary wheel input before clicking.
      for (let n = 0; n < cfg.maxScreens; n++) {
        const pos = await session.run<{ visible: boolean; direction: number }>(
          `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const root=document.querySelector(cfg.host).shadowRoot,e=Array.from(root.querySelectorAll(cfg.name)).find(e=>e.textContent.trim()===cfg.target);if(!e)return {visible:false,direction:1};const r=e.getBoundingClientRect(),s=root.querySelector(cfg.listScroll)?.getBoundingClientRect();return {visible:r.top>=(s?.top??0)&&r.bottom<=Math.min(s?.bottom??innerHeight,innerHeight),direction:r.top<(s?.top??0)?-1:1};},${JSON.stringify({ ...cfg, target: contact.name })})));`,
        );
        if (pos.visible) break;
        if (n === cfg.maxScreens - 1) throw Error('未能找到近期会话');
        await session.scrollShadow(cfg.host, cfg.listScroll, pos.direction);
      }
      await session.clickShadow(cfg.host, cfg.name, contact.name);
      await session.inspect('channels', 'html', '', cfg.url);
      const view = await read<{ rows: { body: string; self: boolean }[]; bottom: boolean }>(
        `const s=root.querySelector(cfg.messageScroll);if(!s)throw Error('会话正文未加载');return {rows:Array.from(s.querySelectorAll(cfg.message)).map(e=>{const p=e.querySelector(cfg.body);const body=p?Array.from(p.childNodes).map(n=>n.nodeType===3?n.textContent:n.nodeName==='IMG'?n.getAttribute('alt')??'':n.textContent).join('').trim():'';return {body,self:!!e.querySelector(cfg.self)};}),bottom:s.scrollTop+s.clientHeight>=s.scrollHeight-4};`,
      );
      // The UI shows a time only on the conversation's latest preview. Older messages have no date even on hover.
      // Never give those messages to AI or claim they are after the start date.
      if (view.rows.length > 1) unknownHistory = true;
      const last = view.rows.at(-1),
        date = inboxDate(contact.time, today),
        time = contact.time.match(/(\d{2}:\d{2})/);
      const sentAt = date && time ? `${date}T${time[1]}:00+08:00` : null;
      const confirmed =
        view.bottom &&
        !!last?.body &&
        last.body === contact.preview &&
        inboxTimestampInScope(sentAt, parameters.startDate, new Date().toISOString());
      const file = `data/inbox/${today}/channels-dm-${tabIndex}-${index}.png`;
      await session.capture(file);
      paths.push(file);
      if (!confirmed) {
        complete = false;
        continue;
      }
      const conversationId = contact.name,
        now = new Date().toISOString();
      const reply = {
        kind: 'dm' as const,
        conversationId,
        latestConfirmed: true,
        lastSender: last!.self ? ('self' as const) : ('other' as const),
        lastMessageAt: sentAt,
      };
      for (const old of db.db
        .select()
        .from(messages)
        .all()
        .filter(
          (m) => m.platformId === 'channels' && m.reply.kind === 'dm' && m.reply.conversationId === conversationId,
        ))
        db.db
          .update(messages)
          .set({ reply, capturedAt: now, updatedAt: now, revision: old.revision + 1 })
          .where(eq(messages.id, old.id))
          .run();
      if (last!.self) continue;
      await storeInboxReading(
        db,
        'channels',
        'dm',
        cfg.url,
        {
          messages: [
            {
              key: 'scoped:' + JSON.stringify([conversationId, sentAt, last!.body]),
              author: contact.name,
              body: last!.body,
              sentAt,
              contentTitle: null,
              reply,
              context: [],
              contextComplete: view.rows.length === 1,
            },
          ],
          complete: false,
          reason: '仅末条消息能由会话列表核对时间，历史未显示日期',
        },
        judgment,
      );
      count++;
    }
  }
  inboxSource(db, {
    platformId: 'channels',
    channel: 'dm',
    status: complete && !unknownHistory ? 'ready' : 'failed',
    capturedAt: new Date().toISOString(),
    reason: unknownHistory
      ? '页面不显示历史私信逐条日期（悬停也没有）；仅保存时间可核对的末条，其他按起号日规则跳过'
      : complete
        ? '私信与打招呼消息已核对'
        : '部分会话末条与列表时间证据不完整，未猜测入库',
  });
  await refreshThemes(db, judgment);
  return { messages: count, complete: complete && !unknownHistory };
}
