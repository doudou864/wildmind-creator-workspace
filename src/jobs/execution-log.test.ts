import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { beginExecutionLog, readExecutionLog, traceExecution, redactDiagnostic } from './execution-log';
test('并发记录分离，失败原样透传且已落盘，敏感值不进入诊断', async () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'fixture-execution-'));
  const db = path.join(folder, 'workspace.db');
  const a = randomUUID(),
    b = randomUUID();
  try {
    await Promise.all(
      [a, b].map(async (id) => {
        beginExecutionLog(db, id);
        const error = Error(`net::ERR_CONNECTION_RESET https://example.test/report?token=hidden token=hidden`);
        await expect(
          traceExecution(id, async () => {
            await Promise.resolve();
            throw error;
          }),
        ).rejects.toBe(error);
      }),
    );
    for (const id of [a, b]) {
      const rows = readExecutionLog(db, id);
      expect(rows.map((r) => r.step)).toEqual(['采集任务', id, id]);
      expect(rows.at(-1)).toMatchObject({ status: 'failed', elapsedMs: expect.any(Number) });
      expect(JSON.stringify(rows)).not.toContain('hidden');
      expect(JSON.stringify(rows)).toContain('ERR_CONNECTION_RESET');
    }
    expect(readExecutionLog(db, randomUUID())).toEqual([]);
    expect(() => readExecutionLog(db, '../../private')).toThrow();
    expect(redactDiagnostic('Authorization: Bearer secret\nCookie: foo=bar\npassword=abc sk-abcdef')).not.toMatch(
      /secret|foo=bar|abc/,
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
