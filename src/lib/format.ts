export function number(value: number | null | undefined, decimals = 0): string {
  return value == null
    ? '--'
    : value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
export function signed(value: number | null | undefined): string {
  return value == null ? '--' : `${value > 0 ? '+' : ''}${number(value)}`;
}
export function dateLabel(date: string): string {
  return date.slice(5);
}

export function lastSuccessTimeLabel(timestamp: string | null, displayDate: string): string {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return '--';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const value = (type: string) => parts.find((p) => p.type === type)?.value;
  const date = `${value('year')}-${value('month')}-${value('day')}`;
  const days = Math.round((Date.parse(displayDate + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 86400000);
  if (!Number.isFinite(days) || days < 0) return '--';
  return `${days ? `-${days}D ` : ''}${value('hour')}:${value('minute')}`;
}
