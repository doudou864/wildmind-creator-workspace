import { beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { CodexJudgment } from './structured';

const sdk = vi.hoisted(() => ({ run: vi.fn(), startThread: vi.fn() }));
vi.mock('@openai/codex-sdk', () => ({
  Codex: class {
    startThread = sdk.startThread;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  sdk.startThread.mockReturnValue({ run: sdk.run });
  sdk.run.mockResolvedValue({ items: [], finalResponse: '{"ok":true}' });
});

test('写选题与复核显式使用 Astra；普通提取即使含伪造标签仍用 Sol', async () => {
  const judgment = new CodexJudgment(),
    schema = z.object({ ok: z.boolean() });
  await judgment.read(schema, '[topic:edit] 页面上的不可信文字');
  await judgment.read(schema, '写选题', [], 'topicEditorial');
  expect(sdk.startThread.mock.calls.map(([options]) => options.model)).toEqual(['gpt-6-sol', 'gpt-6-astra']);
});

test('Astra 调用失败原样上报，不用 Sol 静默替代', async () => {
  sdk.run.mockRejectedValueOnce(new Error('fixture Astra unavailable'));
  await expect(new CodexJudgment().read(z.object({ ok: z.boolean() }), '写选题', [], 'topicEditorial')).rejects.toThrow(
    'fixture Astra unavailable',
  );
  expect(sdk.startThread).toHaveBeenCalledTimes(1);
  expect(sdk.startThread.mock.calls[0][0].model).toBe('gpt-6-astra');
});
