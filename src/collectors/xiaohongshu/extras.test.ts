import { test, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureAccountExtras } from './extras';
import type { CollectionSession } from '../../browser/collection-session';
import type { Judgment } from '../../ai/structured';
import type { WorkspaceDatabase } from '../../db/database';
vi.mock('../state.ts', () => ({ readState: () => ({ month: '2026-10' }) }));
test('辅助图表日期落后仍保存真实日期；无日期不能伪装为平台延迟', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'fixture-xhs-extras-'));
  const session = {
    navigate: async () => {},
    click: async () => {},
    captureChartTip: async () => {},
    inspect: async () => ({ scroll: { top: 0, height: 100, total: 100 } }),
  } as unknown as CollectionSession;
  let date: string | null = '2026-10-27';
  let index = 0;
  const judgment = {
    read: async () => ({
      status: 'ok',
      account: { dataDate: date, metrics: [{ label: ['主页访客', '主页转粉率'][index++ % 2], raw: '1' }] },
      posts: [],
      records: [],
      signals: [],
    }),
  } as unknown as Judgment;
  try {
    const result = await captureAccountExtras(
      {} as WorkspaceDatabase,
      session,
      judgment,
      folder,
      [],
      new Date('2026-10-29T06:00:00Z'),
    );
    expect(result.dataPending?.through).toBe('2026-10-27');
    expect(result.readings.map((r) => r.reading.account.dataDate)).toEqual(['2026-10-27', '2026-10-27']);
    date = null;
    await expect(
      captureAccountExtras({} as WorkspaceDatabase, session, judgment, folder, [], new Date('2026-10-29T06:00:00Z')),
    ).rejects.toThrow('日期无法识别');
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
