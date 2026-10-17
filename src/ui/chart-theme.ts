export function chartTheme(element: HTMLElement) {
  const style = getComputedStyle(element);
  const color = (name: string) => style.getPropertyValue(`--${name}`).trim();
  return {
    ink: color('ink'), muted: color('ink-3'), soft: color('line-soft'), accent: color('accent'), card: color('card'), line: color('line'),
    font: '"JetBrains Mono", "PingFang SC", monospace',
  };
}
