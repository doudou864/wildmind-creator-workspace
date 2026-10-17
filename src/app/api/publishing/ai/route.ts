import { publishAiSchema } from '@/lib/publishing-model';
import { publishingAI } from '@/lib/publishing-store';
import { usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    const input = publishAiSchema.parse(await request.json());
    return Response.json(await usingDatabase((db) => publishingAI(db, input.draft, input.instruction)));
  } catch (e) {
    return serviceError(e);
  }
}
