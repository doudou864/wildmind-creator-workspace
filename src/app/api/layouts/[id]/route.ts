import { usingDatabase } from '@/lib/media-store';
import { saveLayout } from '@/lib/layout-store';
import { serviceError } from '@/lib/api-response';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json();
    const { id } = await context.params;
    return Response.json(await usingDatabase((db) => saveLayout(db, input, id)));
  } catch (e) {
    return serviceError(e);
  }
}
