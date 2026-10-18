import { topicDecisionInputSchema } from '@/lib/topic-model';
import { serviceError } from '@/lib/api-response';
import { usingDatabase } from '@/lib/media-store';
import { decideTopic } from '@/lib/topic-store';
import { loadConfig } from '@/lib/config';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { status } = topicDecisionInputSchema.parse(await request.json());
    const { id } = await context.params;
    const config = await loadConfig();
    return Response.json(await usingDatabase((db) => decideTopic(db, id, status, config)));
  } catch (error) {
    return serviceError(error);
  }
}
