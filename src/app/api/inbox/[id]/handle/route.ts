import { messageActionSchema, handleMessage } from '@/lib/message-actions';
import { serviceError } from '@/lib/api-response';
import { usingDatabase } from '@/lib/media-store';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = messageActionSchema.parse(await request.json());
    const { id } = await context.params;
    return Response.json({ item: await usingDatabase((db) => handleMessage(db, id, input)) });
  } catch (error) {
    return serviceError(error);
  }
}
