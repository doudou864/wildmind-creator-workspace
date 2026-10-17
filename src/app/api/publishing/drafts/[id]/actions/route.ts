import { publishActionSchema } from '@/lib/publishing-model';
import { returnSnapshot } from '@/lib/publishing-store';
import { usingDatabase } from '@/lib/media-store';
import { serviceError, unavailable } from '@/lib/api-response';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = publishActionSchema.parse(await request.json());
    const { id } = await context.params;
    if (input.action !== 'return') return unavailable('平台上传与真实发布：须先通过审查 E');
    return Response.json(await usingDatabase((db) => returnSnapshot(db, id, input.snapshotId)));
  } catch (e) {
    return serviceError(e);
  }
}
