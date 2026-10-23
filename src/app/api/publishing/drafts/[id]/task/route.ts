import { usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
import { publishingTaskActionSchema } from '@/lib/publishing-task-model';
import { controlPublishingTask } from '@/jobs/publishing-tasks';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = publishingTaskActionSchema.parse(await request.json());
    const { id } = await context.params;
    return Response.json(await usingDatabase((db) => controlPublishingTask(db, id, input)));
  } catch (e) {
    return serviceError(e);
  }
}
