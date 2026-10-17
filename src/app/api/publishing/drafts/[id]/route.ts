import { usingDatabase } from '@/lib/media-store';
import { savePublishing } from '@/lib/publishing-store';
import { serviceError } from '@/lib/api-response';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = await request.json();
    const { id } = await context.params;
    return Response.json(
      await usingDatabase((db) =>
        savePublishing(
          db,
          input,
          id,
          request.headers.has('if-match') ? Number(request.headers.get('if-match')) : undefined,
        ),
      ),
    );
  } catch (e) {
    return serviceError(e);
  }
}
