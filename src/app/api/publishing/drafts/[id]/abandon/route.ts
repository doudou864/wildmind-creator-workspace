import { z } from 'zod';
import { abandonPublishing } from '@/lib/publishing-store';
import { usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const input = z
      .object({ expectedRevision: z.number().int().nonnegative() })
      .strict()
      .parse(await request.json());
    return Response.json({ batch: await usingDatabase((db) => abandonPublishing(db, id, input.expectedRevision)) });
  } catch (e) {
    return serviceError(e);
  }
}
