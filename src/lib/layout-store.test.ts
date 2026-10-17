import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { createContent } from './media-store';
import { saveLayout, actOnLayout } from './layout-store';
import { createLayout, layoutPayload } from './layout-model';
import { publishSnapshots } from '../db/schema';
test('确认后禁止直接改稿；退回再确认保存新快照且不改变旧正文和其他平台', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'layout-')),
    db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const content = createContent(db, { title: '验证稿', topicId: null, form: '图文', plannedDate: null });
    let doc = saveLayout(db, layoutPayload(createLayout('# 标题\n\n第一段', content.id)));
    doc = await actOnLayout(db, doc.id!, { platform: 'x', action: 'confirm-send' });
    const first = db.db.select().from(publishSnapshots).get()!;
    const changed = layoutPayload(doc);
    changed.variants.x.title = '第二版';
    expect(() => saveLayout(db, changed, doc.id!)).toThrow('先退回');
    await expect(actOnLayout(db, doc.id!, { platform: 'x', action: 'confirm-send' })).rejects.toThrow('已经确认');
    doc = await actOnLayout(db, doc.id!, { platform: 'x', action: 'revise' });
    doc = saveLayout(db, changed, doc.id!);
    await actOnLayout(db, doc.id!, { platform: 'x', action: 'confirm-send' });
    const snapshots = db.db.select().from(publishSnapshots).all();
    expect(snapshots).toHaveLength(2);
    expect(snapshots.find((s) => s.id === first.id)).toMatchObject({ state: 'returned', content: { title: '标题' } });
    expect(snapshots.find((s) => s.id !== first.id)).toMatchObject({ state: 'ready', content: { title: '第二版' } });
    expect(doc.variants.wechat.title).toBe('标题');
    await expect(actOnLayout(db, doc.id!, { platform: 'douyin', action: 'confirm-send' })).rejects.toThrow('配图');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
