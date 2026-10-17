import { usingDatabase } from '@/lib/media-store';
import { saveLayout } from '@/lib/layout-store';
import { serviceError } from '@/lib/api-response';
import { readLayouts } from '@/lib/workspace-service';
export async function GET() {
  return Response.json(await readLayouts());
}
export async function POST(request: Request) {
  try {
    const input = await request.json();
    return Response.json(await usingDatabase((db) => saveLayout(db, input)));
  } catch (e) {
    return serviceError(e);
  }
}
