import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAutosaveQueue } from '../src/ui/autosave-queue.ts';
const writes = [],
  states = [];
let release;
const gate = new Promise((resolve) => {
  release = resolve;
});
const queue = createAutosaveQueue((s) => states.push(s));
queue.update({
  key: 'a',
  enabled: true,
  save: async ({ isCurrent }) => {
    writes.push('a');
    await gate;
    assert.equal(isCurrent(), false, '旧响应不能覆盖继续输入的内容');
  },
});
const pending = queue.flush();
queue.update({
  key: 'b',
  enabled: true,
  save: async () => {
    writes.push('b');
  },
});
queue.update({
  key: 'c',
  enabled: true,
  save: async () => {
    writes.push('c');
  },
});
assert.equal(queue.flush(), pending, '离开时复用在途请求，不能并发写入');
release();
await pending;
assert.deepEqual(writes, ['a', 'c'], '在途修改最终保存，只存最新一份');
assert.equal(states.at(-1).state, 'saved');
await queue.flush();
assert.equal(writes.length, 2, '相同版本不能重复保存');
queue.update({
  key: 'd',
  enabled: true,
  save: async () => {
    throw new Error('磁盘已满');
  },
});
await queue.flush();
assert.deepEqual(states.at(-1), { state: 'error', reason: '磁盘已满' });
const before = states.length;
await queue.flush();
assert.equal(states.length, before, '失败不无限重试');
queue.update({
  key: 'e',
  enabled: true,
  save: async () => {
    writes.push('e');
  },
});
await queue.flush();
assert.equal(writes.at(-1), 'e', '新修改可从失败恢复');
for (const [page, names] of [
  ['publishing', ['save', 'upload']],
  ['layouts', ['save']],
  ['images', ['saveDraft', 'saveMetadata']],
]) {
  const source = await readFile(`src/app/${page}/${page}-page.tsx`, 'utf8');
  for (const name of names) {
    const start = source.indexOf(`  async function ${name}(`);
    const end = source.indexOf('\n  }', start);
    const fn = source.slice(start, end);
    assert.ok(!fn.includes('setBusy('), `${page}/${name} 不禁用 fieldset，保存中输入保持可用`);
  }
  assert.ok(source.includes('<AutosaveStatus'), `${page} 显示独立保存状态`);
}
const hook = await readFile('src/ui/use-autosave.ts', 'utf8');
assert.ok(hook.includes("'pagehide'"));
assert.ok(hook.includes("'visibilitychange'"));
console.log('PASS autosave: coalescing, in-flight edits, leave flush, errors, usable fields');
for (const page of ['images', 'layouts', 'publishing']) {
  const source = await readFile(`src/app/${page}/${page}-page.tsx`, 'utf8');
  assert.ok(
    source.includes('submittedSession !== editSession.current'),
    `${page} 切换记录后旧响应不能覆盖新记录的身份`,
  );
}
