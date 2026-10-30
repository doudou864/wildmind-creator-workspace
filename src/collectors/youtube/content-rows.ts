export type ContentRow = { title: string; href: string; date: string; text: string };
export function contentRows(rows: ContentRow[], draftLabel: string) {
  const drafts = rows.filter((r) => !r.href && r.text.split('\n').some((line) => line.trim() === draftLabel));
  const published = rows.filter((r) => !drafts.includes(r));
  for (const row of published) {
    if (!row.href) throw Error(`YouTube已发布作品链接缺失：${row.title || '无标题'}`);
    if (!row.date.trim()) throw Error(`YouTube已发布作品日期缺失：${row.title}`);
  }
  return { published, drafts, keys: rows.map((r) => (drafts.includes(r) ? `draft:${r.title}` : r.href)) };
}
