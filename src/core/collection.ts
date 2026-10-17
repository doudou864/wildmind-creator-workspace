export function ageInDays(publishedAt: string, now: Date) {
  const published = new Date(publishedAt);
  if (!Number.isFinite(published.getTime())) throw new Error('发布时间无效');
  return Math.floor((now.getTime() - published.getTime()) / 86400000);
}
export function detailCheckpoints(age: number, checkpoints: number[], completed: number[], anomalous = false) {
  return {
    needed: anomalous || checkpoints.some((d) => age >= d && !completed.includes(d)),
    due: checkpoints.filter((d) => age >= d && !completed.includes(d)),
  };
}
export function historicalKind(age: number, range: [number, number]) {
  return age >= range[0] && age <= range[1] ? ('historical' as const) : ('none' as const);
}
// Preserve the displayed precision; a rounded 万 value is explicitly marked in evidence.
export function parseDisplayedNumber(raw: string | null): number | null {
  if (raw === null || ['', '—', '--', '-', '暂无数据', '数据不足'].includes(raw.trim())) return null;
  const text = raw.replace(/[,，\s]/g, '');
  const match = text.match(/^([+-]?\d+(?:\.\d+)?)(万|亿)?(?:%|秒|s|人|次播放|次|张)?$/);
  if (!match) throw new Error(`不能解析数值：${raw}`);
  const value = Number(match[1]) * (match[2] === '万' ? 10000 : match[2] === '亿' ? 100000000 : 1);
  if (!Number.isFinite(value)) throw new Error('非有限数值');
  return value;
}
export function normalizeTitle(title: string) {
  return title.replace(/\s+/g, ' ').trim();
}

export function groupSources(readings: Map<string, string | null>, groups: Record<string, string[]>) {
  return Object.entries(groups).map(([label, sources]) => {
    const values = sources.map((source) => (readings.has(source) ? parseDisplayedNumber(readings.get(source)!) : null));
    return {
      label,
      raw: values.some((value) => value === null)
        ? null
        : String(values.reduce<number>((sum, value) => sum + (value ?? 0), 0)),
    };
  });
}

export function matchPost<T extends { title: string; publishedAt: string }>(
  posts: T[],
  item: { title: string; publishedAt: string },
) {
  const matches = posts.filter((p) => normalizeTitle(p.title) === normalizeTitle(item.title));
  return matches.length === 1
    ? matches[0]
    : matches.find((p) => Date.parse(p.publishedAt) === Date.parse(item.publishedAt));
}

export function withinRecentWindow(publishedAt: string, now: Date, days: number) {
  const elapsed = now.getTime() - Date.parse(publishedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= days * 86400000;
}

export function normalizeDataDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) throw new Error('数据日期无效');
    return value;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('数据日期无效');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

// Enrollment boundary is fixed; the independent collection lifetime never moves it.
export function sinceStartDate(publishedAt: string, startDate: string, now: Date) {
  const time = Date.parse(publishedAt);
  return Number.isFinite(time) && time >= Date.parse(startDate + 'T00:00:00+08:00') && time <= now.getTime();
}
export function displayedPrecision(raw: string | null): 'exact' | 'display' | 'unknown' {
  return parseDisplayedNumber(raw) === null ? 'unknown' : /[万亿]/.test(raw!) ? 'display' : 'exact';
}
export function exactGrowth(values: { value: number | null; precision: string }[]) {
  return values.length && values.every((v) => v.value !== null && v.precision === 'exact')
    ? values.reduce((sum, v) => sum + v.value!, 0)
    : null;
}
export function missingAccountDates(lastDate: string | null, yesterday: string) {
  if (!lastDate) return [];
  const dates: string[] = [];
  for (
    let time = Date.parse(lastDate + 'T00:00:00Z') + 86400000;
    time < Date.parse(yesterday + 'T00:00:00Z');
    time += 86400000
  )
    dates.push(new Date(time).toISOString().slice(0, 10));
  return dates;
}
