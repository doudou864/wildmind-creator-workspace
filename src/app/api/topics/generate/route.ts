import { usingDatabase } from '@/lib/media-store';
import { generateTopics } from '@/lib/topic-store';
import { serviceError } from '@/lib/api-response';
export async function POST() {
  try {
    return Response.json(await usingDatabase((db) => generateTopics(db)));
  } catch (error) {
    return serviceError(error);
  }
}
