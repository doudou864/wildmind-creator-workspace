import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readdir, rm, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { initializeDatabase, backupDatabase, type WorkspaceDatabase } from './database';
import { startCrawl, finishCrawl } from '../jobs/crawl-log';
import { loadConfig } from '../lib/config';
import { parse, stringify } from 'yaml';
const directories: string[] = [];
const connections: WorkspaceDatabase[] = [];
async function fixture() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wildmind-foundation-'));
  directories.push(dir);
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  connections.push(db);
  return { dir, ...db };
}
afterEach(async () => {
  for (const c of connections.splice(0)) if (c.sqlite.open) c.sqlite.close();
  for (const d of directories.splice(0)) await rm(d, { recursive: true, force: true });
});
describe('本机数据底座', () => {
  test('重复迁移保留真实数据，启用 WAL 与全部实体', async () => {
    const database = await fixture();
    database.sqlite.prepare("INSERT INTO accounts (platform_id,updated_at) VALUES ('douyin','now')").run();
    const second = await initializeDatabase(database.filename);
    connections.push(second);
    expect(second.sqlite.prepare('SELECT count(*) AS n FROM accounts').get()).toEqual({ n: 1 });
    expect(second.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    const names = second.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r) => (r as { name: string }).name);
    for (const name of [
      'topics',
      'contents',
      'posts',
      'post_snapshots',
      'account_daily',
      'crawl_logs',
      'assets',
      'layouts',
      'messages',
      'deals',
      'topic_signals',
      'publish_records',
      'publish_receipts',
      'topic_generation_results',
    ])
      expect(names).toContain(name);
  });
  test('数值空与零分别保存；长表可增加 metric id 而不改表', async () => {
    const database = await fixture();
    database.sqlite.exec("INSERT INTO accounts (platform_id,updated_at) VALUES ('douyin','now')");
    const insert = database.sqlite.prepare(
      'INSERT INTO account_daily (id,platform_id,data_date,metric_id,value,captured_at,updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    insert.run('a', 'douyin', '2026-10-17', 'followers', null, 'now', 'now');
    insert.run('b', 'douyin', '2026-10-17', 'new_followers', 0, 'now', 'now');
    insert.run('c', 'douyin', '2026-10-17', 'test_new_metric', 42, 'now', 'now');
    expect(database.sqlite.prepare('SELECT value FROM account_daily ORDER BY id').all()).toEqual([
      { value: null },
      { value: 0 },
      { value: 42 },
    ]);
    expect(() => insert.run('d', 'douyin', '2026-10-17', 'followers', 1, 'now', 'now')).toThrow();
  });
  test('备份包含 WAL 中的数据，只保留最新7份且其他文件不动', async () => {
    const database = await fixture();
    database.sqlite.exec("INSERT INTO accounts (platform_id,updated_at) VALUES ('douyin','now')");
    const folder = path.join(database.dir, 'backups');
    await writeFile(path.join(folder, 'keep.txt'), '保留');
    let latest = '';
    for (let i = 0; i < 9; i++) latest = await backupDatabase(database);
    expect((await readdir(folder)).filter((n) => n.endsWith('.db'))).toHaveLength(7);
    expect(await readFile(path.join(folder, 'keep.txt'), 'utf8')).toBe('保留');
    const snapshot = new Database(latest, { readonly: true });
    try {
      expect(snapshot.prepare('SELECT platform_id FROM accounts').get()).toEqual({ platform_id: 'douyin' });
    } finally {
      snapshot.close();
    }
  });
  test('迁移失败不丢迁移前备份', async () => {
    const database = await fixture();
    const bad = path.join(database.dir, 'bad-migrations');
    await expect(initializeDatabase(database.filename, bad)).rejects.toThrow();
    expect((await readdir(path.join(database.dir, 'backups'))).length).toBeGreaterThanOrEqual(2);
  });
  test('抓取开始结束、失败原因、重复结束保护与自动备份', async () => {
    const database = await fixture();
    const id = startCrawl(database, 'douyin');
    expect(database.sqlite.prepare('SELECT status,finished_at FROM crawl_logs WHERE id=?').get(id)).toEqual({
      status: 'running',
      finished_at: null,
    });
    await expect(finishCrawl(database, id, { status: 'failed', reason: '' })).rejects.toThrow('原因');
    await finishCrawl(database, id, { status: 'failed', reason: '登录失效', archivePaths: ['data/captures/test.png'] });
    expect(database.sqlite.prepare('SELECT status,reason FROM crawl_logs WHERE id=?').get(id)).toEqual({
      status: 'failed',
      reason: '登录失效',
    });
    await expect(finishCrawl(database, id, { status: 'success' })).rejects.toThrow('已结束');
    const ok = startCrawl(database, 'douyin');
    await finishCrawl(database, ok, { status: 'success' });
    expect((await readdir(path.join(database.dir, 'backups'))).length).toBe(3);
  });
  test('普通记录没有 revision；仅后台并发和发布记录有', async () => {
    const database = await fixture();
    for (const name of ['topics', 'contents', 'assets', 'image_drafts', 'layouts', 'posts'])
      expect((database.sqlite.pragma(`table_info(${name})`) as { name: string }[]).map((r) => r.name)).not.toContain(
        'revision',
      );
    for (const name of [
      'messages',
      'deals',
      'demand_themes',
      'topic_generation_tasks',
      'topic_generation_results',
      'publish_records',
      'publish_receipts',
    ])
      expect((database.sqlite.pragma(`table_info(${name})`) as { name: string }[]).map((r) => r.name)).toContain(
        'revision',
      );
  });
  test('配置文件新增测试指标立即可读，删除后消失，不改前端指标ID', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'wildmind-config-'));
    directories.push(dir);
    await cp('config', dir, { recursive: true });
    const filename = path.join(dir, 'metrics.yaml');
    const original = await readFile(filename, 'utf8');
    const doc = parse(original);
    doc.metrics.push({ ...doc.metrics[0], id: 'test_runtime_metric', name: '测试指标' });
    await writeFile(filename, stringify(doc));
    expect((await loadConfig(dir)).metrics.some((m) => m.id === 'test_runtime_metric')).toBe(true);
    await writeFile(filename, original);
    const config = await loadConfig(dir);
    expect(config.metrics.some((m) => m.id === 'test_runtime_metric')).toBe(false);
    for (const id of ['daily_views', 'followers', 'net_followers', 'new_followers', 'lost_followers'])
      expect(config.metrics.some((m) => m.id === id)).toBe(true);
    expect(config.metrics.length).toBeGreaterThan(250);
  });
});

test('作品长表保持空值、零值与补录类型；发布回执和请求不可重复建', async () => {
  const database = await fixture();
  database.sqlite
    .exec(`INSERT INTO contents(id,form,title,video_covers,updated_at) VALUES('c','视频','测试','{}','now');
 INSERT INTO posts(id,content_id,platform_id,title,updated_at) VALUES('p','c','douyin','测试','now');`);
  const insert = database.sqlite.prepare(
    'INSERT INTO post_snapshots(id,post_id,captured_at,capture_date,metric_id,value,backfill_kind,updated_at) VALUES(?,?,?,?,?,?,?,?)',
  );
  insert.run('s1', 'p', 't1', '2026-10-17', 'test', null, 'historical', 'now');
  insert.run('s2', 'p', 't2', '2026-10-17', 'test', 0, 'checkpoint', 'now');
  expect(database.sqlite.prepare('SELECT value,backfill_kind FROM post_snapshots ORDER BY id').all()).toEqual([
    { value: null, backfill_kind: 'historical' },
    { value: 0, backfill_kind: 'checkpoint' },
  ]);
  database.sqlite
    .exec(`INSERT INTO publish_records(id,content_id,state,draft,created_at,updated_at) VALUES('r','c','draft','{}','now','now');
 INSERT INTO publish_receipts(id,batch_id,platform_id,status,title,safe_to_retry,updated_at) VALUES('receipt','r','douyin','ready','测试',0,'now');
 INSERT INTO publish_requests(id,batch_id,action,input,status,created_at,updated_at) VALUES('request','r','upload','{}','queued','now','now');`);
  expect(() =>
    database.sqlite.exec(
      "INSERT INTO publish_receipts(id,batch_id,platform_id,status,title,safe_to_retry,updated_at) VALUES('duplicate','r','douyin','ready','测试',0,'now')",
    ),
  ).toThrow();
  expect(() =>
    database.sqlite.exec(
      "INSERT INTO publish_requests(id,batch_id,action,input,status,created_at,updated_at) VALUES('request','r','upload','{}','queued','now','now')",
    ),
  ).toThrow();
});

test('完整指标字典不混用账号与作品口径，星级不是百分比', async () => {
  const { metrics } = await loadConfig();
  expect(metrics.find((m) => m.name === '封标点击率星级')?.unit).toBe('星');
  expect(
    metrics
      .filter((m) => m.scope === 'post' && m.name === '封面点击率')
      .some((m) => m.bindings.some((b) => b.platformId === 'douyin' && b.form === '视频')),
  ).toBe(false);
  expect(metrics.find((m) => m.name === '视频推荐来源占比')?.kind).toBe('number');
  for (const section of ['8.1', '8.1.1', '8.2', '8.3', '8.4', '8.5', '8.6', '8.7', '8.8'])
    expect(metrics.some((m) => m.bindings.some((b) => b.prd === section))).toBe(true);
});
