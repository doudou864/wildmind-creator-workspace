import { loadDealConfig } from '@/lib/deal-config';
import { dealSuggestionInputSchema } from '@/lib/deal-model';
import { serviceError } from '@/lib/api-response';
import { usingDatabase } from '@/lib/media-store';
import { confirmSuggestion } from '@/lib/inbox-store';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const config = await loadDealConfig();
    const input = dealSuggestionInputSchema.parse(await request.json());
    const { id } = await context.params;
    return Response.json({ item: await usingDatabase((db) => confirmSuggestion(db, id, input, config)) });
  } catch (error) {
    return serviceError(error);
  }
}
