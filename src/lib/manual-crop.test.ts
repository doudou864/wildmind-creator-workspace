import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeDatabase } from '../db/database';
import { contents, imageCrops, assets } from '../db/schema';
import { generateAssets } from './media-store';
import { saveManualCrop, validateManualCrop } from './manual-crop';
import { exactCrop, imageInfo } from './image-files';
test('over-limit original survives for explicit manual crop; selected exact-ratio region is audited and original is retained', async () => {
  const folder = await mkdtemp(path.join(tmpdir(), 'u9-crop-fixture-')),
    db = await initializeDatabase(path.join(folder, 'db'));
  const source = path.join(folder, 'fixture.png');
  try {
    await promisify(execFile)('/Users/a1234/miniconda3/bin/ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=gray:s=470x400',
      '-frames:v',
      '1',
      source,
    ]);
    db.db
      .insert(contents)
      .values({ id: 'fixture', fixture: true, title: 'fixture', form: '图文', updatedAt: 'fixture', videoCovers: {} })
      .run();
    expect(() => exactCrop(470, 400, '2.35:1', 0.02)).toThrow();
    await generateAssets(
      db,
      {
        title: 'fixture',
        purposeId: 'wechat_cover',
        styleId: 'none',
        prompt: 'fixture',
        content: '',
        ratio: '2.35:1',
        contentId: 'fixture',
        topicId: null,
        existingAssets: {},
        parentAssetId: null,
        editInstruction: '',
      },
      async () => ({ file: source, threadId: 'fixture-thread' }),
    );
    const rows = db.db.select().from(imageCrops).all();
    expect(rows).toHaveLength(2);
    expect(db.db.select().from(assets).all()).toHaveLength(0);
    const crop = rows.find((c) => c.ratio === '2.35:1')!;
    const box = { x: 0, y: 100, width: 470, height: 200 };
    expect(() => validateManualCrop({ ...box, x: 1 }, crop)).toThrow();
    const saved = await saveManualCrop(db, crop.id, box);
    expect(saved?.ratio).toBe('2.35:1');
    expect(await imageInfo(crop.sourcePath)).toMatchObject({ width: 470, height: 400 });
    expect(
      db.db
        .select()
        .from(imageCrops)
        .all()
        .find((c) => c.id === crop.id)?.crop,
    ).toEqual({ ...box, method: 'manual' });
    expect((await saveManualCrop(db, crop.id, box))?.id).toBe(saved?.id);
  } finally {
    for (const a of db.db.select().from(assets).all()) await rm(a.path, { force: true });
    for (const c of db.db.select().from(imageCrops).all()) await rm(c.sourcePath, { force: true });
    db.sqlite.close();
    await rm(folder, { recursive: true, force: true });
  }
});
