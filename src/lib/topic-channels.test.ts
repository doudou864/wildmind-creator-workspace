import { test, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { editTopicChannel, loadTopicChannels } from './topic-channels';

test('panel edits persist to the same source used by generation, retaining builtins and document rules', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fixture-channels-'));
  try {
    const file = path.join(root, 'channels.md'),
      backups = path.join(root, 'backups');
    const original = await readFile('config/选题输入渠道.md', 'utf8');
    await writeFile(file, original);
    const initial = await loadTopicChannels(file);
    const added = await editTopicChannel(
      { action: 'add', revision: initial.revision, title: 'fixture 标题', link: 'https://example.com/fixture' },
      file,
      backups,
    );
    const item = added.channels.at(-1)!;
    expect(item.enabled).toBe(true);
    expect(item.kind).toBe('external');
    expect((await loadTopicChannels(file)).channels.at(-1)?.location).toBe('https://example.com/fixture');
    const changed = await editTopicChannel(
      {
        action: 'edit',
        revision: added.revision,
        id: item.id,
        title: '修改后的 fixture',
        link: 'https://example.com/second',
      },
      file,
      backups,
    );
    expect(changed.channels.at(-1)?.id).toBe(item.id);
    expect(changed.channels.slice(0, -1)).toEqual(initial.channels);
    expect(changed.document.split('```yaml')[0]).toBe(original.split('```yaml')[0]);
    await expect(
      editTopicChannel({ action: 'remove', revision: added.revision, id: item.id }, file, backups),
    ).rejects.toThrow('另一处修改');
    const removed = await editTopicChannel(
      { action: 'remove', revision: changed.revision, id: item.id },
      file,
      backups,
    );
    expect(removed.channels).toEqual(initial.channels);
    expect(await readFile(path.join(backups, initial.revision + '.md'), 'utf8')).toBe(original);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('invalid links and builtin mutation cannot corrupt channel config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fixture-channels-'));
  try {
    const file = path.join(root, 'channels.md'),
      backups = path.join(root, 'backups');
    await writeFile(file, await readFile('config/选题输入渠道.md', 'utf8'));
    const initial = await loadTopicChannels(file);
    for (const link of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com'])
      await expect(
        editTopicChannel({ action: 'add', revision: initial.revision, title: 'fixture', link }, file, backups),
      ).rejects.toThrow();
    await expect(
      editTopicChannel({ action: 'remove', revision: initial.revision, id: initial.channels[0].id }, file, backups),
    ).rejects.toThrow('内置');
    expect((await loadTopicChannels(file)).revision).toBe(initial.revision);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
