import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import { publishVideos } from '@/db/schema';
import { usingDatabase } from '@/lib/media-store';
import { assetFile } from '@/lib/image-files';
import { serviceError } from '@/lib/api-response';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const video = await usingDatabase((db) => db.db.select().from(publishVideos).where(eq(publishVideos.id, id)).get());
    if (!video) return new Response(null, { status: 404 });
    const file = await assetFile(video.path),
      size = (await stat(file)).size;
    const range = request.headers.get('range');
    let start = 0,
      end = size - 1;
    if (range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(range);
      if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
      start = Number(match[1]);
      end = match[2] ? Math.min(Number(match[2]), size - 1) : end;
      if (start > end || start >= size)
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': video.path.endsWith('.mov') ? 'video/quicktime' : 'video/mp4',
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-cache',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      },
    });
  } catch (e) {
    return serviceError(e);
  }
}
