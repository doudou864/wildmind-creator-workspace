import { z } from 'zod';
import { listLocalVideos, referenceVideo } from '@/lib/local-videos';
import { usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function GET() {
  try {
    return Response.json(await listLocalVideos());
  } catch (e) {
    return serviceError(e);
  }
}
export async function POST(request: Request) {
  try {
    const input = z
      .object({ contentId: z.string().min(1), path: z.string().min(1) })
      .strict()
      .parse(await request.json());
    return Response.json({ video: await usingDatabase((db) => referenceVideo(db, input.contentId, input.path)) });
  } catch (e) {
    return serviceError(e);
  }
}
