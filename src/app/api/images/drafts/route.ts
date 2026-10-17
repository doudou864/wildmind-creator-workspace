import { saveImageDraft, usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    const input = await request.json();
    const id = undefined;
    return Response.json(await usingDatabase((db) => saveImageDraft(db, input, id)));
  } catch (e) {
    return serviceError(e);
  }
}
