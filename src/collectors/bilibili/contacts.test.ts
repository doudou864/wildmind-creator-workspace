import { test, expect, vi } from 'vitest';
import { revealContact } from './contacts';
import type { CollectionSession } from '../../browser/collection-session';
test('私信会话在屏幕外时先滚动再重新观察，达到上限不盲点', async () => {
  const run = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
  const scroll = vi.fn();
  const session = { run, scroll } as unknown as CollectionSession;
  await revealContact(session, '.target', '.list', 2);
  expect(scroll).toHaveBeenCalledExactlyOnceWith('.list', 1);
  expect(run).toHaveBeenCalledTimes(2);
  run.mockResolvedValue(1);
  scroll.mockClear();
  await expect(revealContact(session, '.target', '.list', 2)).rejects.toThrow('仍不可见');
  expect(scroll).toHaveBeenCalledTimes(2);
});
