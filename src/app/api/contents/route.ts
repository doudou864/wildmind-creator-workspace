import { readContents } from '@/lib/workspace-service';
import { createContent, usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function GET() {
  return Response.json(await readContents());
}
export async function POST(request: Request) {
  try {
    const input = await request.json();
    return Response.json(await usingDatabase((db) => createContent(db, input)));
  } catch (e) {
    return serviceError(e);
  }
}
