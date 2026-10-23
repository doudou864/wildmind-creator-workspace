import { test, expect } from 'vitest';
import { mkdtemp, realpath, mkdir, writeFile, appendFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { allowedVideo, fingerprint, verifiedVideoPath, type MediaSettings } from './local-videos';
import { mediaStage } from './publishing-media-stage';
import { initializeDatabase } from '../db/database';
import { contents, publishRecords, publishReceipts } from '../db/schema';
import { abandonPublishing } from './publishing-store';
import { newPublishDraft } from './publishing-model';
test('only explicitly allowed original files are referenced; changed or missing files and symlink escapes are blocked', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'u9-video-fixture-'));
  try {
    const allowed = path.join(dir, 'allowed');
    await mkdir(allowed);
    const file = path.join(allowed, 'fixture.mp4'),
      outside = path.join(dir, 'outside.mp4');
    await writeFile(file, 'fixture bytes');
    await writeFile(outside, 'outside');
    await symlink(outside, path.join(allowed, 'escape.mp4'));
    const settings: MediaSettings = {
      ffprobePath: 'unused',
      videoListLimit: 20,
      probeTimeoutMs: 1000,
      finishedVideoDirectories: [allowed],
      allowedVideoFiles: [],
    };
    expect(await allowedVideo(file, settings)).toBe(await realpath(file));
    await expect(allowedVideo(outside, settings)).rejects.toThrow('允许');
    await expect(allowedVideo(path.join(allowed, 'escape.mp4'), settings)).rejects.toThrow('允许');
    expect(await allowedVideo("'" + outside + "'", { ...settings, allowedVideoFiles: [outside] })).toBe(
      await realpath(outside),
    );
    const mark = await fingerprint(file);
    const record = {
      id: 'fixture',
      contentId: 'fixture',
      name: 'fixture.mp4',
      path: file,
      bytes: mark.bytes,
      fingerprint: mark,
      duration: 1,
      width: 16,
      height: 16,
      updatedAt: 'original',
    };
    expect(await verifiedVideoPath(record, settings)).toBe(await realpath(file));
    await appendFile(file, 'changed');
    await expect(verifiedVideoPath(record, settings)).rejects.toThrow('已改变');
    await rm(file);
    await expect(verifiedVideoPath(record, settings)).rejects.toThrow('不存在');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('abandon is local and traceable; published and unknown outcomes never become editable or retryable', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'u9-stage-fixture-'));
  const db = await initializeDatabase(path.join(dir, 'test.db'));
  try {
    db.db
      .insert(contents)
      .values({
        id: 'fixture-content',
        fixture: true,
        title: 'fixture',
        form: '视频',
        videoCovers: {},
        updatedAt: 'original',
      })
      .run();
    const draft = { ...newPublishDraft('video'), contentId: 'fixture-content' };
    db.db
      .insert(publishRecords)
      .values({
        id: 'fixture-batch',
        fixture: true,
        contentId: 'fixture-content',
        state: 'prepared',
        draft,
        createdAt: 'original',
        updatedAt: 'original',
      })
      .run();
    db.db
      .insert(publishReceipts)
      .values({
        id: 'fixture-receipt',
        batchId: 'fixture-batch',
        platformId: 'douyin',
        status: 'ready',
        title: 'fixture',
        safeToRetry: false,
        uploadedAt: '2026-10-20T00:00:00Z',
        updatedAt: 'original',
      })
      .run();
    const before = db.db.select().from(publishReceipts).all();
    const batch = db.db.select().from(publishRecords).all()[0];
    expect(mediaStage(batch, before)).toBe('uploaded');
    for (const status of ['unknown', 'uploading', 'submitting', 'queued', 'published', 'pending_review'] as const)
      expect(mediaStage(batch, [{ ...before[0], status }])).not.toBe('editable');
    const done = abandonPublishing(db, batch.id, 0);
    expect(done.abandonedAt).toBeTruthy();
    expect(done.state).toBe('prepared');
    expect(db.db.select().from(publishReceipts).all()).toEqual(before);
    expect(mediaStage(done, before)).toBe('abandoned');
    expect(() => abandonPublishing(db, batch.id, 1)).toThrow('只有');
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
