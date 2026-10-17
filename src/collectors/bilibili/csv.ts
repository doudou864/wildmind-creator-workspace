export function bilibiliMetric(label: string, raw: string, aliases: Record<string, string>) {
  if (label === '封标点击率') {
    if (!/^\d+(?:\.\d+)?星$/.test(raw)) throw new Error('封标点击率不再是星级；必须使用独立百分位指标，禁止混用');
    return { label: aliases[label], raw };
  }
  return { label, raw };
}
