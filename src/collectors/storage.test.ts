import * as cancellation from '../jobs/cancellation';
import { test, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { initializeDatabase } from '../db/database';
import { loadConfig } from '../lib/config';
import { loadDouyinConfig } from './douyin/config';
import { metricFor, postKey, persistCollection, prepareAssociations, type CapturedReading } from './storage';
import { screenshotReading } from './recognition';
import { dueSlot, scheduleForDay } from '../jobs/schedule';
test('指标仅按同平台同形式匹配，视频作品级封面点击率不采，未知和舍弃不入数值表', async () => {
  const config = await loadConfig();
  const dy = await loadDouyinConfig();
  expect(metricFor(config, 'douyin', 'post', '视频', '封面点击率', dy.aliases)).toBeUndefined();
  expect(metricFor(config, 'douyin', 'post', '图文', '封面点击率', dy.aliases)?.id).toBe('douyin_图文_封面点击率');
  expect(metricFor(config, 'douyin', 'post', '视频', '弹幕量', dy.aliases)).toBeUndefined();
  expect(metricFor(config, 'douyin', 'account', 'all', '吸粉量', dy.accountAliases)?.id).toBe('new_followers');
});
test('真实零和未知分开；失败回滚，不导入超30天历史作品，搜索词走TopicSignal', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'collector-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    const config = await loadConfig();
    const dy = await loadDouyinConfig();
    const now = new Date('2026-10-17T11:00:00Z');
    const post = { title: '测试作品', publishedAt: '2026-10-14T02:20:00+08:00', form: '视频' as const };
    const key = postKey('douyin', post.title, post.publishedAt);
    expect(postKey('channels', '相同标题', '2026-10-14', 'id-1')).not.toBe(
      postKey('channels', '相同标题', '2026-10-14', 'id-2'),
    );
    const incoming = [{ ...post, key, platformPostId: 'native-123' }];
    const decisions = new Map([[key, { postId: key, contentId: 'content', topicTitle: '测试选题', form: post.form }]]);
    const reading = screenshotReading.parse({
      status: 'ok',
      reason: null,
      posts: [
        {
          ...post,
          metrics: [
            { label: '播放', raw: '0' },
            { label: '点赞', raw: '—' },
          ],
        },
      ],
      account: {
        dataDate: '2026-10-16',
        metrics: [
          { label: '吸粉量', raw: '1' },
          { label: '总粉丝量', raw: '3.07万' },
        ],
      },
      records: [{ type: 'diagnosis', text: '作品状态正常' }],
      signals: [{ type: 'search', text: '测试搜索词', share: '10%' }],
    });
    const captures: CapturedReading[] = [
      { sourcePath: 'data/captures/a.png', capturedAt: now.toISOString(), reading, kind: 'detail', postKey: key },
    ];
    const options = {
      history: true,
      historyRange: dy.historyRange,
      aliases: dy.aliases,
      accountAliases: dy.accountAliases,
      completed: { [key]: [3] },
      now,
    };
    // A bad date must roll back the whole import, including automatically created content.
    reading.account.dataDate = null;
    expect(() => persistCollection(db, 'douyin', incoming, captures, decisions, config, options)).toThrow('日期');
    expect(db.sqlite.prepare('SELECT count(*) n FROM topics').get()).toEqual({ n: 0 });
    reading.account.dataDate = '2026-10-16';
    persistCollection(db, 'douyin', incoming, captures, decisions, config, options);
    expect(db.sqlite.prepare('SELECT metric_id,value FROM post_snapshots ORDER BY metric_id').all()).toEqual([
      { metric_id: 'douyin_视频_播放量', value: 0 },
      { metric_id: 'douyin_视频_点赞量', value: null },
    ]);
    expect(db.sqlite.prepare('SELECT data_date,value FROM account_daily').get()).toEqual({
      data_date: '2026-10-16',
      value: 1,
    });
    expect(
      db.sqlite.prepare("SELECT precision,raw_value FROM account_daily WHERE metric_id='followers'").get(),
    ).toEqual({ precision: 'display', raw_value: '3.07万' });
    expect(db.sqlite.prepare('SELECT text FROM topic_signals').get()).toEqual({ text: '测试搜索词' });
    expect(db.sqlite.prepare('SELECT type FROM raw_records').get()).toEqual({ type: 'diagnosis' });
    const repeat = await prepareAssociations(
      db,
      'douyin',
      incoming,
      {
        read: async () => {
          throw new Error('已有关联不能重新猜测');
        },
      },
      2,
    );
    expect(repeat.get(key)?.contentId).toBe('content');
    // A later completed capture replaces this day's values, never adds another daily sample.
    const fresh = structuredClone(captures[0]);
    fresh.capturedAt = '2026-10-17T14:00:00Z';
    fresh.reading.posts[0].metrics[0].raw = '120';
    fresh.reading.account.metrics[0].raw = '9';
    persistCollection(db, 'douyin', incoming, [fresh], repeat, config, options);
    expect(db.sqlite.prepare('SELECT count(*) n FROM post_snapshots').get()).toEqual({ n: 2 });
    expect(
      db.sqlite.prepare("SELECT value,captured_at FROM post_snapshots WHERE metric_id='douyin_视频_播放量'").get(),
    ).toEqual({ value: 120, captured_at: fresh.capturedAt });
    expect(db.sqlite.prepare("SELECT value FROM account_daily WHERE metric_id='new_followers'").get()).toEqual({
      value: 9,
    });
    const failed = structuredClone(fresh);
    failed.reading.posts[0].metrics[0].raw = '999';
    failed.reading.account.dataDate = null;
    expect(() => persistCollection(db, 'douyin', incoming, [failed], repeat, config, options)).toThrow('日期');
    expect(db.sqlite.prepare("SELECT value FROM post_snapshots WHERE metric_id='douyin_视频_播放量'").get()).toEqual({
      value: 120,
    });
    const guard = vi.spyOn(cancellation, 'throwIfCollectionCancelled').mockImplementation(() => {
      throw new cancellation.CollectionCancelled();
    });
    try {
      expect(() => persistCollection(db, 'douyin', incoming, [fresh], repeat, config, options)).toThrow('已停止');
      expect(db.sqlite.prepare('SELECT count(*) n FROM post_snapshots').get()).toEqual({ n: 2 });
    } finally {
      guard.mockRestore();
    }
    const tomorrow = structuredClone(fresh);
    tomorrow.capturedAt = '2026-10-18T06:00:00Z';
    persistCollection(db, 'douyin', incoming, [tomorrow], repeat, config, {
      ...options,
      now: new Date(tomorrow.capturedAt),
    });
    expect(db.sqlite.prepare('SELECT count(*) n FROM post_snapshots').get()).toEqual({ n: 4 });

    const renamed = await prepareAssociations(
      db,
      'douyin',
      [{ ...incoming[0], key: 'changed-key', title: '改过的标题' }],
      {
        read: async () => {
          throw new Error('同一平台ID不重新建档');
        },
      },
      2,
    );
    expect(renamed.get('changed-key')?.postId).toBe(key);
    const different = { ...incoming[0], key: 'new-post', title: post.title, platformPostId: 'another-native' };
    await expect(
      prepareAssociations(
        db,
        'douyin',
        [different],
        { read: async () => ({ matches: [{ key: 'new-post', contentId: 'outside', topicTitle: '越界' }] }) as never },
        2,
      ),
    ).rejects.toThrow('候选之外');

    const old = { key: 'old', title: '旧作品', publishedAt: '2026-01-01T00:00:00+08:00', form: '视频' as const };
    const oldReading = structuredClone(reading);
    oldReading.posts = [{ ...old, metrics: [{ label: '播放', raw: '10000' }] }];
    oldReading.account.metrics = [];
    oldReading.records = [];
    oldReading.signals = [];
    expect(() =>
      persistCollection(
        db,
        'douyin',
        [old],
        [{ ...captures[0], postKey: 'old', reading: oldReading }],
        new Map([['old', { postId: 'old', contentId: 'old-content', topicTitle: '旧选题', form: old.form }]]),
        config,
        { ...options, completed: {} },
      ),
    ).toThrow('起号日');
    expect(db.sqlite.prepare("SELECT count(*) n FROM post_snapshots WHERE post_id='old'").get()).toEqual({ n: 0 });
    expect(db.sqlite.prepare("SELECT count(*) n FROM posts WHERE id='old'").get()).toEqual({ n: 0 });
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('调度从配置随机选择窗口，成功不重抓；失败只按11点和11点半重试', () => {
  expect(scheduleForDay('10:32', '10:45', () => 0)).toBe(632);
  expect(scheduleForDay('10:32', '10:45', () => 0.999)).toBe(645);
  const retries = ['11:00', '11:30'];
  expect(dueSlot(new Date('2026-10-17T10:31:00+08:00'), 640, retries, [], false)).toBeNull();
  expect(dueSlot(new Date('2026-10-17T10:40:00+08:00'), 640, retries, [], false)).toBe('main');
  expect(dueSlot(new Date('2026-10-17T11:00:00+08:00'), 640, retries, ['main'], false)).toBe('11:00');
  expect(dueSlot(new Date('2026-10-17T11:30:00+08:00'), 640, retries, ['main', '11:00'], false)).toBe('11:30');
  expect(dueSlot(new Date('2026-10-17T11:30:00+08:00'), 640, retries, [], true)).toBeNull();
});

test('错过多个时段只补最近一次，不会倒序补跑更早的重试', () => {
  expect(dueSlot(new Date('2026-10-17T12:00:00+08:00'), 640, ['11:00', '11:30'], ['main', '11:30'], false)).toBeNull();
});

test('流量表的搜索来源映射为搜索流量占比，不当作播放量', async () => {
  const config = await loadConfig();
  const dy = await loadDouyinConfig();
  expect(metricFor(config, 'douyin', 'post', '视频', '搜索', dy.aliases)?.id).toBe('douyin_视频_搜索流量占比');
});
