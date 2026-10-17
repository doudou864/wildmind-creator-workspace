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
