import { test, expect } from 'vitest';
import { addDailyNet } from './account';
import type { CapturedReading } from '../storage';
function reading(labels: string[], raw = '2'): CapturedReading[] {
  return labels.map((label, i) => ({
    kind: 'account',
    sourcePath: 'data/test.png',
    capturedAt: '2026-10-17T00:00:00Z',
    reading: {
      status: 'ok',
      reason: null,
      posts: [],
      records: [],
      signals: [],
      account: { dataDate: '2026-10-16', metrics: [{ label, raw: i === 1 ? raw : '1' }] },
    },
  }));
}
test('视觉结果可用字典标准名或后台名，净增必须同日且精确', () => {
  const aliases = { 总粉丝数: '粉丝总数', 新增粉丝数: '新增关注', 流失粉丝数: '取消关注' };
  for (const labels of [['粉丝总数', '新增关注', '取消关注'], Object.keys(aliases)]) {
    const r = reading(labels);
    addDailyNet(r, aliases);
    expect(r.at(-1)!.reading.account.metrics.at(-1)).toEqual({ label: '粉丝净增', raw: '1' });
  }
  const approx = reading(['粉丝总数', '新增关注', '取消关注'], '1万');
  addDailyNet(approx, aliases);
  expect(approx.at(-1)!.reading.account.metrics.at(-1)!.raw).toBeNull();
  const different = reading(['粉丝总数', '新增关注', '取消关注']);
  different[0].reading.account.dataDate = '2026-10-15';
  expect(() => addDailyNet(different, aliases)).toThrow('日期不一致');
});
