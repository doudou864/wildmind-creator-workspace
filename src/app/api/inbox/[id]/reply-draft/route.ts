import { usingDatabase } from '@/lib/media-store';
import { writeReplyDraft } from '@/lib/reply-draft';
import { serviceError } from '@/lib/api-response';
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return Response.json(await usingDatabase((db) => writeReplyDraft(db, id)));
  } catch (e) {
    return serviceError(e);
  }
}
