import { saveImageDraft, usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json();
    const id = (await context.params).id;
    return Response.json(await usingDatabase((db) => saveImageDraft(db, input, id)));
  } catch (e) {
    return serviceError(e);
  }
}
