import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { usingDatabase } from '@/lib/media-store';
import { inspectLocalVideo } from '@/lib/local-videos';
import { contents, publishVideos } from '@/db/schema';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    const { file } = z
      .object({ file: z.string() })
      .strict()
      .parse(await request.json());
    const video = await inspectLocalVideo(file);
    return Response.json(
      await usingDatabase((db) =>
        db.db.transaction((tx) => {
          const old = tx
            .select()
            .from(publishVideos)
            .all()
            .find((v) => v.path === video.path);
          if (old) return { contentId: old.contentId };
          const id = randomUUID(),
            now = new Date().toISOString();
          tx.insert(contents)
            .values({
              id,
              title: path
                .basename(file)
                .replace(/\.(mp4|mov)$/i, '')
                .slice(0, 200),
              form: '视频',
              topicId: null,
              plannedDate: null,
              videoCovers: {},
              updatedAt: now,
            })
            .run();
          tx.insert(publishVideos)
            .values({ ...video, id: randomUUID(), contentId: id, name: path.basename(file), updatedAt: now })
            .run();
          return { contentId: id };
        }),
      ),
    );
  } catch (e) {
    return serviceError(e);
  }
}
