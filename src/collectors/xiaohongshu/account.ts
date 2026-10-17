import { displayedPrecision, parseDisplayedNumber } from '../../core/collection.ts';
import type { CapturedReading } from '../storage.ts';
export function addDailyNet(readings: CapturedReading[], aliases: Record<string, string>) {
  const accounts = readings.filter((r) => r.kind === 'account');
  const dates = new Set(accounts.map((r) => r.reading.account.dataDate));
  if (dates.size !== 1 || dates.has(null)) throw new Error('粉丝单日日期不一致');
  const metrics = accounts.flatMap((r) => r.reading.account.metrics);
  const find = (name: string) => metrics.find((m) => (aliases[m.label] ?? m.label) === name);
  const added = find('新增关注'),
    lost = find('取消关注');
  if (!added || !lost || !find('粉丝总数') || metrics.length !== 3) throw new Error('粉丝单日3项不全');
  const a = parseDisplayedNumber(added.raw),
    l = parseDisplayedNumber(lost.raw);
  accounts.at(-1)!.reading.account.metrics.push({
    label: '粉丝净增',
    raw:
      a === null || l === null || displayedPrecision(added.raw) !== 'exact' || displayedPrecision(lost.raw) !== 'exact'
        ? null
        : String(a - l),
  });
}
