import { usingDatabase } from '@/lib/media-store';
import { loadConfig } from '@/lib/config';
import { loadDataCenterConfig } from '@/lib/data-center-config';
import { generateInterpretation } from '@/lib/data-center-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const [{ id }, config, settings, input] = await Promise.all([
      context.params,
      loadConfig(),
      loadDataCenterConfig(),
      request.json(),
    ]);
    return Response.json(await usingDatabase((db) => generateInterpretation(db, config, settings, id, input)));
  } catch (e) {
    return serviceError(e);
  }
}
