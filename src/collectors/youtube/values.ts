import { displayedPrecision, parseDisplayedNumber, normalizeDataDate } from '../../core/collection.ts';
import { PlatformDataPending } from '../availability.ts';
export function reportDateRange(text: string) {
  const match = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[–—−-]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) throw new Error('YouTube报表日期范围未能确认，未写入数据');
  const date = (offset: number) =>
    normalizeDataDate(`${match[offset]}-${match[offset + 1].padStart(2, '0')}-${match[offset + 2].padStart(2, '0')}`);
  const start = date(1),
    end = date(4);
  if (start > end) throw new Error('YouTube报表日期范围无效');
  return { start, end };
}

export function requireReportDates(
  range: { start: string; end: string },
  posts: { title: string; publishedAt: string }[],
) {
  const pending = posts.filter((p) => normalizeDataDate(p.publishedAt) > range.end);
  if (pending.length)
    throw new PlatformDataPending(
      range.end,
      `YouTube报表仅更新至${range.end}，${pending.length}条新作品尚未进入报表：${pending.map((p) => p.title).join('、')}；等待平台更新后重试，未将缺失指标填零`,
    );
}
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
