import { test, expect } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { CollectionSession } from '../../browser/collection-session';
import { exportRecentPosts } from './export';
import { runInNewContext } from 'node:vm';
test('11条近期稿件分两次选择导出，排除起号前旧稿并保留各自CSV来源', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'bili-export-'));
  const cards = Array.from({ length: 12 }, (_, i) => ({
    title: `稿件${i}`,
    date: i === 11 ? '2026年01月01日 12:00:00' : `2026年10月${String(16 - i).padStart(2, '0')}日 12:00:00`,
    selected: i < 10,
  }));
  const downloaded: number[] = [];
  const session = {
    inspect: async () => ({ scroll: { top: 0, height: 100, total: 100 } }),
    scroll: async () => {},
    run: async () => cards.map((c) => ({ ...c })),
    click: async (selector: string) => {
      if (selector.startsWith('.card >> nth=')) {
        const index = Number(selector.split('=')[1]);
        cards[index].selected = !cards[index].selected;
      }
    },
    download: async (_selector: string, file: string) => {
      const selected = cards.filter((c) => c.selected);
      downloaded.push(selected.length);
      await writeFile(file, '视频标题,发布时间\n' + selected.map((c) => `${c.title},${c.date}`).join('\n'));
    },
  } as unknown as CollectionSession;
  try {
    const counts: number[] = [];
    const paths: string[] = [];
    const result = await exportRecentPosts(
      session,
      'bilibili',
      {
        choose: '.choose',
        card: '.card',
        title: '.title',
        date: '.date',
        scroll: '.scroll',
        confirm: '.confirm',
        batchSize: 10,
        maxSegments: 10,
        readyTimeoutMs: 15000,
      },
      '.export',
      folder,
      paths,
      '2026-09-17',
      30,
      new Date('2026-10-17T12:00:00Z'),
      (n) => counts.push(n),
    );
    expect(downloaded).toEqual([10, 1]);
    expect(result).toHaveLength(11);
    expect(result.some((x) => x.row['视频标题'] === '稿件11')).toBe(false);
    expect(result[10].sourcePath).toBe(paths[1]);
    expect(counts).toEqual([11]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('稿件选择骨架先出现时等待标题和日期，不能把两个空骨架当重复作品', async () => {
  let loaded = false;
  const checks: boolean[] = [];
  const cards = [0, 1].map((i) => ({
    querySelector: (selector: string) => ({
      textContent: loaded ? (selector === '.title' ? `fixture旧稿${i}` : `2025年01月0${2 - i}日 12:00:00`) : '',
    }),
    classList: { contains: () => false },
  }));
  const document = {
    querySelector: () => cards[0],
    querySelectorAll: (selector: string) => (selector === 'iframe' ? [] : cards),
  };
  const page = {
    waitForFunction: async (fn: (cfg: unknown) => boolean, cfg: unknown) => {
      checks.push(!!fn(cfg));
      loaded = true;
      checks.push(!!fn(cfg));
      expect(checks.at(-1)).toBe(true);
    },
    evaluate: async (fn: (cfg: unknown) => unknown, cfg: unknown) => fn(cfg),
  };
  const session = {
    inspect: async () => ({ scroll: { top: 0, height: 100, total: 100 } }),
    click: async () => {},
    run: async (script: string) => {
      let result: unknown;
      await runInNewContext(`(async()=>{${script}})()`, {
        page,
        document,
        console: {
          log: (value: string) => {
            result = JSON.parse(value.slice('WORKSPACE_RESULT:'.length));
          },
        },
      });
      return result;
    },
  } as unknown as CollectionSession;
  expect(
    await exportRecentPosts(
      session,
      'bilibili',
      {
        choose: '.choose',
        card: '.card',
        title: '.title',
        date: '.date',
        scroll: '.scroll',
        confirm: '.confirm',
        batchSize: 10,
        maxSegments: 10,
        readyTimeoutMs: 15000,
      },
      '.export',
      '/fixture',
      [],
      '2026-09-17',
      30,
      new Date('2026-10-24T06:30:00Z'),
      () => {},
    ),
  ).toEqual([]);
  expect(checks).toEqual([false, true]);
});
