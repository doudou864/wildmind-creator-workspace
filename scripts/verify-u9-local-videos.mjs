// Only creates temporary, explicitly marked fixture records and a synthetic one-second video.
import { mkdtemp, rm, appendFile, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initializeDatabase } from '../src/db/database.ts';
import { contents } from '../src/db/schema.ts';
import { mediaSettings, listLocalVideos, referenceVideo, verifiedVideoPath } from '../src/lib/local-videos.ts';
const dir = await mkdtemp(path.join(tmpdir(), 'wildmind-u9-b-fixture-'));
const db = await initializeDatabase(path.join(dir, 'fixture.db'));
try {
  const settings = { ...(await mediaSettings()), finishedVideoDirectories: [dir] };
  const file = path.join(dir, 'fixture.mp4');
  execFileSync(path.join(path.dirname(settings.ffprobePath), 'ffmpeg'), [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=64x64:d=1',
    '-c:v',
    'mpeg4',
    '-pix_fmt',
    'yuv420p',
    file,
  ]);
  db.db
    .insert(contents)
    .values({
      id: 'fixture-u9-b',
      fixture: true,
      title: 'U9 文件引用测试',
      form: '视频',
      videoCovers: {},
      updatedAt: '2026-10-20',
    })
    .run();
  const listing = await listLocalVideos(settings);
  const saved = await referenceVideo(db, 'fixture-u9-b', file, settings);
  const duplicate = await referenceVideo(db, 'fixture-u9-b', file, settings);
  const verified = await verifiedVideoPath(saved, settings);
  await appendFile(file, 'fixture changed');
  let blocked = false;
  try {
    await verifiedVideoPath(saved, settings);
  } catch (e) {
    blocked = e.message.includes('已改变');
  }
  const proof = {
    fixture: true,
    listed: listing.items.map(({ name, bytes, duration, width, height }) => ({ name, bytes, duration, width, height })),
    keptOriginalPath: saved.path === (await realpath(file)),
    noDuplicateReference: saved.id === duplicate.id,
    verifiedBeforeChange: verified === saved.path,
    blockedAfterChange: blocked,
    fingerprint: saved.fingerprint,
  };
  if (!proof.keptOriginalPath || !proof.noDuplicateReference || !proof.verifiedBeforeChange || !blocked)
    throw Error('fixture verification failed');
  await writeFile('docs/verification/u9/b/local-video-proof.json', JSON.stringify(proof, null, 2) + '\n');
  console.log(proof);
} finally {
  db.sqlite.close();
  await rm(dir, { recursive: true, force: true });
}
