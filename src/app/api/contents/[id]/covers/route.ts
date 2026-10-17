import { usingDatabase } from '@/lib/media-store';
import { adoptCover } from '@/lib/publishing-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json();
    const { id } = await context.params;
    return Response.json(await usingDatabase((db) => adoptCover(db, id, input)));
  } catch (e) {
    return serviceError(e);
  }
}
