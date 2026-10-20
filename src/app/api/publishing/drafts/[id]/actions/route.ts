import { verifyBatchFiles } from '@/lib/local-videos';
import { publishActionSchema } from '@/lib/publishing-model';
import { returnSnapshot } from '@/lib/publishing-store';
import { usingDatabase } from '@/lib/media-store';
import { serviceError, unavailable } from '@/lib/api-response';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = publishActionSchema.parse(await request.json());
    const { id } = await context.params;
    if (input.action === 'upload') await usingDatabase((db) => verifyBatchFiles(db, id));
    if (input.action !== 'return')
      return unavailable('平台上传与真实发布：审查 E 已通过，等待新作品完成上传核验；首次发布仍须审查 F');
    return Response.json(await usingDatabase((db) => returnSnapshot(db, id, input.snapshotId)));
  } catch (e) {
    return serviceError(e);
  }
}
