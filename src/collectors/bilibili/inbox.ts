import { revealContact } from './contacts.ts';
import { readCommentEngagement } from '../inbox-engagement.ts';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../../db/database.ts';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { loadConfig } from '../../lib/config.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import { storeInboxReading, inboxSource, refreshThemes, type incomingMessageSchema } from '../../lib/inbox-store.ts';
import { advanceCommentPage } from './pagination.ts';
export async function collectBilibiliInbox(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const cfg = z
    .object({
      url: z.url(),
      row: z.string(),
      author: z.string(),
      body: z.string(),
      time: z.string(),
      title: z.string(),
      next: z.string(),
      currentPage: z.string(),
      pageReadyTimeoutMs: z.number().int().positive(),
      maxPages: z.number().int().positive(),
      batchSize: z.number().int().positive(),
      selfNames: z.array(z.string()),
    })
    .parse(parse(await readFile('config/inbox-bilibili.yaml', 'utf8')));
  const { parameters } = await loadConfig();
  await session.navigate(cfg.url, cfg.row);
  const all: z.infer<typeof incomingMessageSchema>[] = [];
  let complete = false;
  const pages = new Set<string>();
  for (let n = 0; n < cfg.maxPages; n++) {
    await session.inspect('bilibili');
    const rows = await session.run<{ author: string; body: string; time: string; title: string }[]>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>Array.from(document.querySelectorAll(cfg.row)).map(e=>({author:e.querySelector(cfg.author)?.textContent.trim()??'',body:e.querySelector(cfg.body)?.textContent.trim()??'',time:e.querySelector(cfg.time)?.textContent.trim()??'',title:e.querySelector(cfg.title)?.textContent.trim()??''})),${JSON.stringify(cfg)})));`,
    );
    const fingerprint = JSON.stringify(rows);
    if (pages.has(fingerprint)) throw Error('评论翻页没有前进，未标记完整');
    pages.add(fingerprint);
    const filename = `data/inbox/${shanghaiDate()}/bilibili-comments-${n}.png`;
    await session.capture(filename);
    paths.push(filename);
    const engagement = await readCommentEngagement(judgment, filename, rows);
    for (const [index, row] of rows.entries()) {
      if (row.time.slice(0, 10) < parameters.startDate || cfg.selfNames.includes(row.author) || !row.body) continue;
      all.push({
        key: JSON.stringify([row.author, row.body, row.time, row.title]),
        author: row.author,
        body: row.body,
        sentAt: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(row.time) ? row.time.replace(' ', 'T') + '+08:00' : null,
        contentTitle: row.title,
        reply: { kind: 'comment', ownReplyFound: null, repliesComplete: false, ...engagement[index] },
        context: [],
        contextComplete: false,
      });
    }
    const hasNext = await session.run<boolean>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(selector=>{const e=document.querySelector(selector);return !!e&&!e.className.includes('disabled');},${JSON.stringify(cfg.next)})));`,
    );
    if (!hasNext || rows.some((r) => r.time.slice(0, 10) < parameters.startDate)) {
      complete = true;
      break;
    }
    await advanceCommentPage(session, cfg, fingerprint);
  }
  for (let i = 0; i < all.length; i += cfg.batchSize)
    await storeInboxReading(
      db,
      'bilibili',
      'comment',
      cfg.url,
      { messages: all.slice(i, i + cfg.batchSize), complete: false, reason: '正在分批分类' },
      judgment,
    );
  inboxSource(db, {
    platformId: 'bilibili',
    channel: 'comment',
    status: complete ? 'ready' : 'failed',
    capturedAt: new Date().toISOString(),
    reason: complete ? '已读取起号日以来的评论；未完整展开的回复串保持未知' : '达到翻页上限，评论未读完',
  });
  await refreshThemes(db, judgment);
  return { messages: all.length, complete, pages: pages.size };
}

export async function collectBilibiliDM(
  db: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  const { dm: cfg, batchSize } = z
    .object({
      batchSize: z.number().int().positive(),
      dm: z.object({
        url: z.url(),
        contact: z.string(),
        name: z.string(),
        message: z.string(),
        text: z.string(),
        time: z.string(),
        self: z.string(),
        maxConversations: z.number().int().positive(),
        contactScroll: z.string(),
        maxScrolls: z.number().int().positive(),
        systemNames: z.array(z.string()),
      }),
    })
    .parse(parse(await readFile('config/inbox-bilibili.yaml', 'utf8')));
  const { parameters } = await loadConfig();
  await session.navigate(cfg.url, cfg.contact);
  const contacts = await session.run<{ id: string; name: string }[]>(
    `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>Array.from(document.querySelectorAll(cfg.contact)).map(e=>({id:e.getAttribute('data-id'),name:e.querySelector(cfg.name)?.textContent.trim()??''})),${JSON.stringify(cfg)})));`,
  );
  const targets = contacts.filter((c) => !cfg.systemNames.includes(c.name)).slice(0, cfg.maxConversations);
  const messages: z.infer<typeof incomingMessageSchema>[] = [];
  for (const [index, contact] of targets.entries()) {
    const selector = `[data-id=${JSON.stringify(contact.id)}]`;
    await revealContact(session, selector, cfg.contactScroll, cfg.maxScrolls);
    await session.click(selector);
    await session.inspect('bilibili', 'html', '', cfg.url);
    const rows = await session.run<{ key: string; body: string; time: string; self: boolean }[]>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>Array.from(document.querySelectorAll(cfg.message)).map(e=>({key:e.getAttribute('data-msg-key'),body:e.querySelector(cfg.text)?.textContent.trim()??'[非文字消息]',time:e.parentElement.parentElement.parentElement.querySelector(cfg.time)?.textContent.trim()??'',self:!!e.querySelector(cfg.self)})),${JSON.stringify(cfg)})));`,
    );
    const parsed = rows
      .map((r) => ({
        ...r,
        at: r.time.replace(
          /(\d{4})年(\d{1,2})月(\d{1,2})日 (\d{2}:\d{2})/,
          (_, y, m, d, t) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${t}:00+08:00`,
        ),
      }))
      .filter((r) => Number.isFinite(Date.parse(r.at)))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    if (!parsed.length) continue;
    if (parsed[0].at.slice(0, 10) < parameters.startDate) break;
    const filename = `data/inbox/${shanghaiDate()}/bilibili-dm-${index}.png`;
    await session.capture(filename);
    paths.push(filename);
    for (const row of parsed.filter((r) => !r.self && r.at.slice(0, 10) >= parameters.startDate))
      messages.push({
        key: 'native:' + row.key,
        author: contact.name,
        body: row.body,
        sentAt: row.at,
        contentTitle: null,
        reply: {
          kind: 'dm',
          conversationId: contact.id,
          latestConfirmed: parsed[0].key === rows[0]?.key && parsed[0].body !== '[非文字消息]',
          lastSender: parsed[0].body === '[非文字消息]' ? 'unknown' : parsed[0].self ? 'self' : 'other',
          lastMessageAt: parsed[0].at,
        },
        context: parsed
          .filter((r) => r.at.slice(0, 10) >= parameters.startDate)
          .map((r) => ({
            id: r.key,
            sender: r.self ? 'self' : 'other',
            author: r.self ? '我' : contact.name,
            body: r.body,
            sentAt: r.at,
          })),
        contextComplete: false,
      });
  }
  for (let i = 0; i < messages.length; i += batchSize)
    await storeInboxReading(
      db,
      'bilibili',
      'dm',
      cfg.url,
      { messages: messages.slice(i, i + batchSize), complete: true, reason: null },
      judgment,
    );
  inboxSource(db, {
    platformId: 'bilibili',
    channel: 'dm',
    status: contacts.length > cfg.maxConversations ? 'failed' : 'ready',
    capturedAt: new Date().toISOString(),
    reason:
      contacts.length > cfg.maxConversations
        ? '会话数超过本轮上限，未读全'
        : '读取当前会话列表中起号日以来的已加载消息；更早历史不回翻',
  });
  await refreshThemes(db, judgment);
  return { conversations: targets.length, messages: messages.length };
}
