import { displayedPrecision, parseDisplayedNumber } from '../../core/collection.ts';
// The page displays a clock duration; store seconds without asking AI to calculate.
export function durationSeconds(raw: string | null) {
  if (raw === null || !raw.includes(':')) return raw;
  const parts = raw.trim().split(':');
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((p) => !/^\d+$/.test(p)) ||
    parts.slice(1).some((p) => Number(p) >= 60)
  )
    throw new Error(`观看时长格式无效：${raw}`);
  return String(parts.reduce((total, part) => total * 60 + Number(part), 0));
}
export function subscriberChange(
  current: string | null,
  previous: { value: number | null; precision: string } | undefined,
) {
  if (displayedPrecision(current) !== 'exact' || !previous || previous.precision !== 'exact' || previous.value === null)
    return null;
  return String(parseDisplayedNumber(current)! - previous.value);
}
