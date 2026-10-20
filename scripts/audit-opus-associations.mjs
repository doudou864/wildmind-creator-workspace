import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
const db = new Database('data/workspace.db', { readonly: true, fileMustExist: true });
db.pragma('query_only = ON');
const ids = ['32368148-3fd2-437f-b2c2-33f00d254356', 'efb564b8-8403-48fe-b12c-7d127953f48a'];
const quote = (s) => '"' + s.replaceAll('"', '""') + '"';
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all()
  .map((r) => r.name);
const all = Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${quote(t)}`).all()]));
const includes = (v, targets) => {
  if (typeof v === 'string') {
    if (targets.has(v)) return true;
    try {
      return includes(JSON.parse(v), targets);
    } catch {
      return false;
    }
  }
  if (Array.isArray(v)) return v.some((x) => includes(x, targets));
  if (v && typeof v === 'object') return Object.values(v).some((x) => includes(x, targets));
  return false;
};
const result = ids.map((id) => {
  const content = all.contents.find((c) => c.id === id),
    topic = all.topics.find((t) => t.id === content.topic_id);
  const posts = all.posts
    .filter((p) => p.content_id === id)
    .map((post) => ({ ...post, snapshots: all.post_snapshots.filter((s) => s.post_id === post.id) }));
  const targets = new Set([id, ...posts.map((p) => p.id)]);
  const relations = Object.fromEntries(
    Object.entries(all)
      .filter(([t]) => !['contents', 'posts', 'post_snapshots'].includes(t))
      .map(([t, rows]) => [t, rows.filter((r) => includes(r, targets)).map((r) => r.id)])
      .filter(([, rows]) => rows.length),
  );
  const titleMessages = all.messages
    .filter((m) => m.content_title?.replace(/\s/g, '') === content.title.replace(/\s/g, ''))
    .map((m) => ({
      id: m.id,
      author: m.author,
      platformId: m.platform_id,
      postId: m.post_id,
      contentId: m.content_id,
    }));
  return { content, topic, posts, relations, titleMessages };
});
db.close();
writeFileSync('docs/verification/u1/opus-association-evidence.json', JSON.stringify(result, null, 2) + '\n');
const esc = (v) =>
  String(v ?? '未记录')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
let report =
  '# Opus5.5 作品关联只读调查\n\n本文件由 `node scripts/audit-opus-associations.mjs` 只读生成；原始数据点、记录 ID 和关联明细见 [JSON 证据](opus-association-evidence.json)。未合并、未修改这两条作品或消息。\n';
for (const r of result) {
  report += `\n## 作品 ${r.content.id}\n\n标题：${r.content.title}\n\n选题：${r.topic.id}（${r.topic.title}）；automatic=${r.topic.automatic}，frozen_fire=${r.topic.frozen_fire}。建档时间依据选题 created_at：${r.topic.created_at}；作品本身没有 created_at。\n\n| 平台 | 发布时间（原值） | 平台作品 ID | 本机发布记录 ID | 数据点行数 |\n|---|---|---|---|---|\n`;
  for (const p of r.posts) {
    report +=
      '| ' +
      [p.platform_id, p.published_at, p.platform_post_id, p.id, p.snapshots.length].map(esc).join(' | ') +
      ' |\n';
  }
  report +=
    '\n### 已采集数据点\n\n同一天多次采集逐行保留，不能把数据点行数当作作品条数。完整 snapshot ID、采集时间、精度和补录类型在 JSON 中。\n\n| 平台 | 采集时间 | 发布后天数 | 指标 | 数值 | 精度 | 补录类型 |\n|---|---|---|---|---|---|---|\n';
  for (const p of r.posts)
    for (const s of p.snapshots)
      report +=
        '| ' +
        [p.platform_id, s.captured_at, s.day_after_publish, s.metric_id, s.value, s.precision, s.backfill_kind]
          .map(esc)
          .join(' | ') +
        ' |\n';
  report +=
    '\n### 关联记录\n\n' +
    Object.entries(r.relations)
      .map(([t, ids]) => `- ${t}（${ids.length}）：${ids.join('、')}`)
      .join('\n') +
    '\n\n按作品标题对应的消息（不冒充外键关联）：\n' +
    r.titleMessages
      .map(
        (m) =>
          `- ${m.author} / ${m.id} / ${m.platformId} / post_id=${m.postId ?? '空'} / content_id=${m.contentId ?? '空'}`,
      )
      .join('\n') +
    '\n';
}
writeFileSync('docs/verification/u1/opus-association-details.md', report);
console.log(
  result.map((r) => ({
    id: r.content.id,
    posts: r.posts.map((p) => ({ platform: p.platform_id, points: p.snapshots.length })),
    relations: Object.fromEntries(Object.entries(r.relations).map(([t, ids]) => [t, ids.length])),
    titleMessages: r.titleMessages.length,
  })),
);
