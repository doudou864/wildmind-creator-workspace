export function dataDate(value: string) {
  return value.length === 10
    ? value
    : new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(value));
}
export function freshness(value: string | null | undefined, today: string) {
  if (!value) return '尚未成功更新';
  const date = dataDate(value);
  const late = Math.max(0, Math.round((Date.parse(today) - Date.parse(date)) / 86400000));
  return late
    ? `停在 ${date.slice(5)}（晚 ${late} 天）`
    : value.length > 10
      ? `今天 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))}`
      : '今天';
}
export const workTitle = (title: string) => title.replace(/(?:\s*#[^#]*)+$/u, '').trim();
