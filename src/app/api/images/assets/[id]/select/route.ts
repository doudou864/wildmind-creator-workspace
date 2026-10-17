import { z } from 'zod';
import { selectImage, usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    z.object({})
      .strict()
      .parse(await request.json());
    const { id } = await context.params;
    return Response.json(await usingDatabase((db) => selectImage(db, id)));
  } catch (e) {
    return serviceError(e);
  }
}
