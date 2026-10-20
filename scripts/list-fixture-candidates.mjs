// Read-only audit: a matching name is a candidate, never a fixture decision.
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
const db = new Database('data/workspace.db', { readonly: true, fileMustExist: true });
db.pragma('query_only = ON');
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((r) => r.name);
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const rows = Object.fromEntries(tables.map((name) => [name, db.prepare(`SELECT * FROM ${quote(name)}`).all()]));
const parse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};
const names = {
  contents: ['作品', (r) => r.title],
  image_drafts: ['生图草稿', (r) => parse(r.input)?.title ?? ''],
  layouts: ['排版草稿', (r) => r.source.split('\n')[0]],
  publish_records: [
    '发布记录',
    (r) =>
      [rows.contents.find((c) => c.id === r.content_id)?.title, parse(r.draft)?.commonCopy?.title]
        .filter(Boolean)
        .join(' · 发布标题：'),
  ],
  messages: ['消息', (r) => [r.author, r.content_title].filter(Boolean).join(' · ')],
  deals: ['商单', (r) => r.brand ?? ''],
};
function references(value, id) {
  if (Array.isArray(value)) return value.some((v) => references(v, id));
  if (value && typeof value === 'object')
    return Object.entries(value).some(([k, v]) =>
      /(?:Id|Ids|_id|_ids)$/.test(k) ? v === id || (Array.isArray(v) && v.includes(id)) : references(v, id),
    );
  return false;
}
function linkedCount(table, row) {
  const linked = new Set();
  for (const [name, records] of Object.entries(rows))
    for (const [index, record] of records.entries()) {
      if (name === table && record.id === row.id) continue;
      if (
        Object.entries(record).some(
          ([key, value]) => (key.endsWith('_id') && value === row.id) || references(parse(value), row.id),
        )
      )
        linked.add(`${name}:${record.id ?? index}`);
    }
  for (const fk of db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all())
    if (row[fk.from] != null) linked.add(`${fk.table}:${row[fk.from]}`);
  return linked.size;
}
const escape = (value) =>
  String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
const candidates = [];
for (const [table, [type, name]] of Object.entries(names))
  for (const r of rows[table] ?? []) {
    const title = name(r);
    if (!/验收|测试/.test(title)) continue;
    candidates.push({ id: r.id, type, name: title, created: r.created_at ?? '未记录', links: linkedCount(table, r) });
  }
db.close();
const output =
  '# 测试数据候选清单（待用户逐条确认）\n\n只读扫描，没有标记、修改或删除任何数据库记录。名称匹配仅供人工核对，不作为页面过滤依据。\n\n扫描：作品、各类草稿、发布记录、消息、商单。消息没有标题，列出作者及关联作品名称，不扫描消息正文；发布草稿按发布记录列出。创建时间未存储时写“未记录”，不使用更新时间代替。关联数量为直接入向引用（包括 JSON 中的 ID 引用）与出向外键记录去重数，不是级联总数。\n\n共 ' +
  candidates.length +
  ' 条候选。\n\n| ID | 类型 | 名称 | 创建时间 | 直接关联数量 |\n|---|---|---|---|---|\n' +
  candidates.map((r) => '| ' + [r.id, r.type, r.name, r.created, r.links].map(escape).join(' | ') + ' |').join('\n') +
  '\n';
writeFileSync('docs/verification/u1/fixture-candidates.md', output);
console.log(
  JSON.stringify({
    total: candidates.length,
    byType: Object.fromEntries(
      [...new Set(candidates.map((r) => r.type))].map((type) => [
        type,
        candidates.filter((r) => r.type === type).length,
      ]),
    ),
  }),
);
