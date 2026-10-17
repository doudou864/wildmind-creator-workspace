import { themeSyncSchema } from '@/lib/workspace-model';
import { serviceError } from '@/lib/api-response';
import { usingDatabase } from '@/lib/media-store';
import { syncTheme } from '@/lib/inbox-store';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = themeSyncSchema.parse(await request.json());
    const { id } = await context.params;
    const result = await usingDatabase((db) => syncTheme(db, id, input.expectedRevision));
    return Response.json({ themeId: result.id, signalId: result.signalId });
  } catch (error) {
    return serviceError(error);
  }
}
