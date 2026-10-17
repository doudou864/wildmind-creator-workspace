import { loadDealConfig } from '@/lib/deal-config';
import { dealEditSchema } from '@/lib/deal-model';
import { serviceError } from '@/lib/api-response';
import { usingDatabase } from '@/lib/media-store';
import { editDeal } from '@/lib/inbox-store';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const config = await loadDealConfig();
    const input = dealEditSchema(config).parse(await request.json());
    const { id } = await context.params;
    return Response.json({ item: await usingDatabase((db) => editDeal(db, id, input, config)) });
  } catch (error) {
    return serviceError(error);
  }
}
