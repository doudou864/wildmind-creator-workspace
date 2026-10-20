import { test, expect } from 'vitest';
import { documentFromBlocks, blocksFromDocument, documentHTML, nodeText } from './rich-document';
import { createLayout, layoutPayload } from './layout-model';
import { saveLayout, actOnLayout } from './layout-store';
import { initializeDatabase } from '../db/database';
import { contents, publishSnapshots } from '../db/schema';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
test('legacy headings, paragraphs, quote, list and image captions survive document conversion; markup is escaped', () => {
  const old = createLayout('标题\n\n## 小标题\n正文 **强调**\n> 引用\n- 一\n- 二').variants.wechat;
  old.blocks.push({ id: 'image', type: 'image', assetId: 'fixture-asset', text: '图片说明' });
  const doc = documentFromBlocks(old.blocks),
    back = blocksFromDocument(doc);
  expect(nodeText(doc)).toContain('图片说明');
  expect(back.some((b) => b.assetId === 'fixture-asset')).toBe(true);
  for (const text of ['小标题', '正文', '强调', '引用', '一', '二']) expect(nodeText(doc)).toContain(text);
  const html = documentHTML({ ...old, title: '<script>bad</script>', document: doc });
  expect(html).toContain('<strong>强调</strong>');
  expect(html).not.toContain('<script>');
  expect(html).toContain('fixture-asset/file');
});
test('rich content is frozen in confirmed snapshot; editing another platform cannot change it', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'u9-layout-fixture-')),
    db = await initializeDatabase(path.join(folder, 'db'));
  try {
    db.db
      .insert(contents)
      .values({ id: 'fixture', fixture: true, title: 'fixture', form: '图文', updatedAt: 'original', videoCovers: {} })
      .run();
    const doc = createLayout('测试标题\n测试正文', 'fixture');
    doc.variants.x.document = documentFromBlocks(doc.variants.x.blocks);
    const saved = saveLayout(db, layoutPayload(doc));
    await actOnLayout(db, saved.id!, { platform: 'x', action: 'confirm-send' });
    const snapshot = db.db.select().from(publishSnapshots).all()[0];
    expect(snapshot.content.document).toBeTruthy();
    const locked = await actOnLayout(db, saved.id!, { platform: 'x', action: 'revise' });
    locked.variants.x.title = '改动草稿';
    saveLayout(db, layoutPayload(locked), saved.id!);
    expect(db.db.select().from(publishSnapshots).all()[0].content).toEqual(snapshot.content);
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
