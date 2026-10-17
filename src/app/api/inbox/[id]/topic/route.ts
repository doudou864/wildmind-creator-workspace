import { inboxTopicInputSchema } from '@/lib/inbox-model';
import { serviceError } from '@/lib/api-response';
import { usingDatabase } from '@/lib/media-store';
import { syncMessage } from '@/lib/inbox-store';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = inboxTopicInputSchema.parse(await request.json());
    const { id } = await context.params;
    return Response.json({ item: await usingDatabase((db) => syncMessage(db, id, input.expectedRevision)) });
  } catch (error) {
    return serviceError(error);
  }
}
