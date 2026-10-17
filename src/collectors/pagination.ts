// Each visible page must advance without duplicate identities; totals changing mid-run require a fresh run.
export class PageCoverage {
  private seen = new Set<string>();
  private total: number | undefined;
  add(keys: string[], total: number) {
    if (!Number.isInteger(total) || total < 0 || (this.total !== undefined && total !== this.total))
      throw new Error('列表总数发生变化，请重新采集');
    this.total = total;
    if ((!keys.length && total > 0) || keys.some((k) => !k || this.seen.has(k)) || new Set(keys).size !== keys.length)
      throw new Error('翻页未推进或作品身份重复，停止以免漏采');
    keys.forEach((k) => this.seen.add(k));
    if (this.seen.size > total) throw new Error('已读取条数超过页面总数');
    return this.seen.size === total;
  }
  finish() {
    if (this.total === undefined || this.seen.size !== this.total) throw new Error('分页未读全，不能写入不完整数据');
  }
}
export function batches<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('分批大小必须为正整数');
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}
