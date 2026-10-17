import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { createContent } from './media-store';
import { saveLayout, actOnLayout } from './layout-store';
import { createLayout, layoutPayload } from './layout-model';
import { newPublishDraft } from './publishing-model';
import { savePublishing, returnSnapshot, publishingData, publishingAI } from './publishing-store';
import { publishSnapshots } from '../db/schema';
test('发布准备只能接收原确认稿；退回后不可再采用旧快照，上传与发布保持关闭', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'publish-')),
    db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const content = createContent(db, { title: '测试图文', topicId: null, form: '图文', plannedDate: null });
    const layout = saveLayout(db, layoutPayload(createLayout('标题\n\n正文', content.id)));
    await actOnLayout(db, layout.id!, { platform: 'x', action: 'confirm-send' });
    const snap = db.db.select().from(publishSnapshots).get()!;
    const draft = {
      ...newPublishDraft('layout'),
      contentId: content.id,
      snapshotIds: [snap.id],
      settings: [
        {
          platformId: 'x',
          individuallyEdited: false,
          title: snap.content.title,
          description: '',
          tags: [],
          scheduleAt: null,
        },
      ],
    };
    const batch = await savePublishing(db, draft);
    const saved = await savePublishing(db, draft, batch.id, batch.revision);
    expect(saved.revision).toBe(batch.revision + 1);
    await expect(savePublishing(db, draft, batch.id, batch.revision)).rejects.toThrow('其他窗口');
    await expect(savePublishing(db, { ...draft, settings: [{ ...draft.settings[0], title: '篡改' }] })).rejects.toThrow(
      '内容被改写',
    );
    const returned = await returnSnapshot(db, batch.id, snap.id);
    expect(returned.draft.snapshotIds).toEqual([]);
    expect(returned.draft.settings).toEqual([]);
    await expect(savePublishing(db, draft)).rejects.toThrow('已退回');
    expect(publishingData(db)).toMatchObject({ uploadReady: false, publishReady: false, storageReady: true });
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
test('AI 只生成通用文案，保留用户已单独编辑的平台文案', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'publish-ai-')),
    db = await initializeDatabase(path.join(folder, 'workspace.db'));
  try {
    const content = createContent(db, { title: '测试视频', topicId: null, form: '视频', plannedDate: null });
    const draft = {
      ...newPublishDraft('video'),
      contentId: content.id,
      settings: [
        {
          platformId: 'douyin',
          individuallyEdited: true,
          title: '用户标题',
          description: '用户正文',
          tags: ['保留'],
          scheduleAt: null,
        },
      ],
    };
    const result = await publishingAI(db, draft, '测试', {
      async read(schema) {
        return schema.parse({ title: 'AI标题', description: 'AI正文', tags: [] });
      },
    });
    expect(result.commonCopy.title).toBe('AI标题');
    expect(result.settings).toEqual(draft.settings);
    await expect(savePublishing(db, { ...draft, videoId: 'other-content-video' })).rejects.toThrow('不属于');
  } finally {
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
