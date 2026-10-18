/** Read displayed calendar dates without inventing an exact message time. */
export function inboxDate(value: string, today: string): string | null {
  const text = value.trim();
  let date: string | null = null;
  if (/^(今天|刚刚|\d+\s*(秒|分钟|小时)前)/.test(text) || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) date = today;
  else if (/^(昨天|前天)/.test(text)) {
    const days = text.startsWith('前天') ? 2 : 1;
    date = new Date(Date.parse(today + 'T00:00:00+08:00') - days * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  } else {
    const match = text.match(/^(?:(\d{4})[-/年])?(\d{1,2})[-/月](\d{1,2})(?:日|\b)/);
    if (match) {
      const year = match[1] ?? today.slice(0, 4);
      date = `${year}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
      // Yearless dates in a newest-first list refer to the latest past occurrence.
      if (!match[1] && date > today) date = `${Number(year) - 1}${date.slice(4)}`;
    }
  }
  if (!date || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return null;
  return date;
}

export function inboxTimestampInScope(value: string | null, startDate: string, now: string): boolean {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= Date.parse(startDate + 'T00:00:00+08:00') && time <= Date.parse(now);
}

/** Relative day labels are rounded: refuse the boundary day instead of guessing. */
export function inboxDisplayScope(value: string, today: string, startDate: string): 'recent' | 'old' | 'unknown' {
  const days = value.trim().match(/^(\d+)\s*天前$/);
  if (days) {
    const shift = (n: number) => new Date(Date.parse(today + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);
    if (shift(Number(days[1]) + 1) >= startDate) return 'recent';
    if (shift(Number(days[1])) < startDate) return 'old';
    return 'unknown';
  }
  const date = inboxDate(value, today);
  return !date || date > today ? 'unknown' : date < startDate ? 'old' : 'recent';
}

/** For a newest-first notification list, dated neighbours can bound a weekday label. */
export function notificationScopes(values: string[], today: string, startDate: string) {
  const scopes = values.map((value) => inboxDisplayScope(value, today, startDate));
  return scopes.map((scope, index) => {
    if (scope !== 'unknown' || !/^(?:星期|周)[日天一二三四五六]$/.test(values[index].trim())) return scope;
    const newer = scopes.slice(0, index).findLast((s) => s !== 'unknown');
    const older = scopes.slice(index + 1).find((s) => s !== 'unknown');
    return newer === 'recent' && older === 'recent' ? ('recent' as const) : ('unknown' as const);
  });
}
