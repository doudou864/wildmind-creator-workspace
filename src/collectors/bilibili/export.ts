import { readFile } from 'node:fs/promises';
import type { CollectionSession } from '../../browser/collection-session.ts';
import { chinesePublishedAt, parseCsv } from '../csv.ts';
import { batches } from '../pagination.ts';
import { sinceStartDate, withinRecentWindow } from '../../core/collection.ts';
export type ExportConfig = {
  choose: string;
  card: string;
  title: string;
  date: string;
  scroll: string;
  confirm: string;
  batchSize: number;
  maxSegments: number;
};
type Card = { title: string; date: string; selected: boolean };
export async function exportRecentPosts(
  session: CollectionSession,
  platformId: string,
  cfg: ExportConfig,
  exportSelector: string,
  folder: string,
  paths: string[],
  startDate: string,
  recentWindow: number,
  now: Date,
  checkCount: (count: number) => void,
) {
  const readCards = () =>
    session.run<Card[]>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>{const d=[document,...Array.from(document.querySelectorAll('iframe')).map(f=>{try{return f.contentDocument}catch{return null}})].find(d=>d?.querySelector(cfg.card));if(!d)throw new Error('稿件选择列表不存在');return Array.from(d.querySelectorAll(cfg.card)).map(e=>({title:e.querySelector(cfg.title)?.textContent?.trim()??'',date:e.querySelector(cfg.date)?.textContent?.trim()??'',selected:e.classList.contains('active')}));},${JSON.stringify(cfg)})));`,
    );
  const key = (p: { title: string; date: string }) => JSON.stringify([p.title, p.date]);
  const recent = (p: Card) =>
    sinceStartDate(chinesePublishedAt(p.date), startDate, now) &&
    withinRecentWindow(chinesePublishedAt(p.date), now, recentWindow);
  await session.click(cfg.choose);
  let cards: Card[] = [],
    ended = false;
  for (let segment = 0; segment < cfg.maxSegments; segment++) {
    await session.inspect(platformId, cfg.scroll);
    cards = await readCards();
    if (!cards.length || new Set(cards.map(key)).size !== cards.length) throw new Error('稿件选择列表为空或身份重复');
    // The visible selector is newest first. Verify that order before using an old-date boundary.
    if (
      cards.some(
        (p, i) => i > 0 && Date.parse(chinesePublishedAt(p.date)) > Date.parse(chinesePublishedAt(cards[i - 1].date)),
      )
    )
      throw new Error('稿件列表不再按发布时间倒序，不能推断边界');
    checkCount(cards.filter(recent).length);
    const state = await session.inspect(platformId, cfg.scroll);
    if (cards.some((p) => !recent(p))) {
      ended = true;
      break;
    }
    await session.scroll(cfg.scroll);
    const after = await readCards();
    if (state.scroll.top + state.scroll.height >= state.scroll.total - 3 && after.length === cards.length) {
      ended = true;
      break;
    }
  }
  if (!ended) throw new Error('稿件选择列表未读到边界，请检查滚动容量');
  const wanted = cards.filter(recent);
  const output: { row: Record<string, string>; sourcePath: string }[] = [];
  const groups = batches(wanted, cfg.batchSize);
  for (const [batchIndex, group] of groups.entries()) {
    if (batchIndex) await session.click(cfg.choose);
    const targets = new Set(group.map(key));
    let visible = await readCards();
    for (let segment = 0; group.some((p) => !visible.some((v) => key(v) === key(p))); segment++) {
      if (segment >= cfg.maxSegments) throw new Error('未找到本批全部稿件');
      await session.scroll(cfg.scroll);
      visible = await readCards();
    }
    // Deselect first so the platform's ten-item cap never blocks the next batch.
    for (const [index, card] of visible.entries())
      if (card.selected && !targets.has(key(card))) await session.click(`${cfg.card} >> nth=${index}`);
    visible = await readCards();
    for (const [index, card] of visible.entries())
      if (!card.selected && targets.has(key(card))) await session.click(`${cfg.card} >> nth=${index}`);
    const selected = (await readCards()).filter((p) => p.selected);
    if (selected.length !== group.length || selected.some((p) => !targets.has(key(p))))
      throw new Error('稿件选中结果与本批不一致');
    await session.click(cfg.confirm);
    const file = `${folder}/posts-${batchIndex + 1}.csv`;
    await session.download(exportSelector, file);
    paths.push(file);
    const rows = parseCsv(await readFile(file, 'utf8'));
    const actual = rows.map((r) => key({ title: r['视频标题'], date: r['发布时间'] }));
    if (rows.length !== group.length || new Set(actual).size !== group.length || actual.some((k) => !targets.has(k)))
      throw new Error('稿件导出与选择名单不一致');
    output.push(...rows.map((row) => ({ row, sourcePath: file })));
  }
  if (!groups.length) await session.click(cfg.confirm);
  return output;
}
