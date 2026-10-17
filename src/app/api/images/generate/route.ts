import { generateAssets, usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    const input = await request.json();
    return Response.json(await usingDatabase((db) => generateAssets(db, input)));
  } catch (e) {
    return serviceError(e);
  }
}
