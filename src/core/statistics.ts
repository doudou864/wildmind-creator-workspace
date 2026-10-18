/** Linear interpolation at (n - 1) * p; p=.5 matches the existing two-middle-value median. */
export function quantile(values: number[], p: number): number | null {
  if (p < 0 || p > 1) throw new Error('分位数必须在0与1之间');
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p,
    lower = Math.floor(index),
    upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}
