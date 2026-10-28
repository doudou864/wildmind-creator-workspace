import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
export type ExecutionEvent = {
  at: string;
  step: string;
  status: 'started' | 'success' | 'failed';
  elapsedMs?: number;
  detail?: string;
};
const context = new AsyncLocalStorage<{ file: string }>();
export function redactDiagnostic(value: string) {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/g, (url) => url.split(/[?#]/)[0])
    .replace(/((?:authorization|cookie|set-cookie)\s*[:=]\s*)[^\r\n]+/gi, '$1[已隐藏]')
    .replace(
      /((?:access_token|refresh_token|token|password|secret|api[_-]?key)\s*["']?\s*[:=]\s*["']?)[^\s,;"'}]+/gi,
      '$1[已隐藏]',
    )
    .replace(/\b(?:sk-[\w-]+|Bearer\s+[\w.\-]+)/gi, '[已隐藏]')
    .slice(0, 4000);
}
export function executionLogPath(databaseFile: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error('执行记录编号无效');
  return path.join(path.dirname(databaseFile), 'execution-logs', `${id}.jsonl`);
}
export function beginExecutionLog(databaseFile: string, id: string) {
  const file = executionLogPath(databaseFile, id);
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  context.enterWith({ file });
  executionEvent('采集任务', 'started');
}
export function executionEvent(step: string, status: ExecutionEvent['status'], detail?: string, elapsedMs?: number) {
  const current = context.getStore();
  if (!current) return;
  appendFileSync(
    current.file,
    JSON.stringify({
      at: new Date().toISOString(),
      step,
      status,
      elapsedMs,
      ...(detail ? { detail: redactDiagnostic(detail) } : {}),
    }) + '\n',
    { mode: 0o600 },
  );
}
export async function traceExecution<T>(step: string, action: () => Promise<T>): Promise<T> {
  const start = Date.now();
  executionEvent(step, 'started');
  try {
    const result = await action();
    executionEvent(step, 'success', undefined, Date.now() - start);
    return result;
  } catch (error) {
    executionEvent(
      step,
      'failed',
      error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error),
      Date.now() - start,
    );
    throw error;
  }
}
export function readExecutionLog(databaseFile: string, id: string): ExecutionEvent[] {
  const file = executionLogPath(databaseFile, id);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split('\n');
  // A live append may leave the last line incomplete; completed malformed lines remain visible errors.
  return lines
    .slice(0, -1)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
