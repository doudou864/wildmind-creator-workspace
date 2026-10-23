import { expect, test } from 'vitest';
import { shouldSyncPublishingEditor } from './publishing-editor-sync';

test('自动保存返回后，旧列表不得将表单退回旧版本或再次触发保存', () => {
  expect(shouldSyncPublishingEditor({ id: 'a', revision: 8 }, { id: 'a', revision: 7 }, false)).toBe(false);
  expect(shouldSyncPublishingEditor({ id: 'a', revision: 8 }, { id: 'a', revision: 8 }, false)).toBe(false);
});
test('后台任务进度可以同步，但不能覆盖正在输入的内容或另一条任务', () => {
  expect(shouldSyncPublishingEditor({ id: 'a', revision: 8 }, { id: 'a', revision: 9 }, false)).toBe(true);
  expect(shouldSyncPublishingEditor({ id: 'a', revision: 8 }, { id: 'a', revision: 9 }, true)).toBe(false);
  expect(shouldSyncPublishingEditor({ id: 'a', revision: 8 }, { id: 'b', revision: 9 }, false)).toBe(false);
});
