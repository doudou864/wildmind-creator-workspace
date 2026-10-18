/** Read displayed calendar dates without inventing an exact message time. */
export function inboxDate(value: string, today: string): string | null {
  const text = value.trim();
  let date: string | null = null;
  if (/^(今天|刚刚|\d+\s*(秒|分钟|小时)前)/.test(text)) date = today;
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
