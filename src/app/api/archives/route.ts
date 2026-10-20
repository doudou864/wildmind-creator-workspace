import { usingDatabase } from '@/lib/media-store';
import { archiveRecord, archiveList } from '@/lib/record-archives';
import { serviceError } from '@/lib/api-response';
export async function GET() {
  return Response.json({ items: await usingDatabase(archiveList) });
}
export async function POST(request: Request) {
  try {
    const input = await request.json();
    return Response.json(await usingDatabase((db) => archiveRecord(db, input)));
  } catch (e) {
    return serviceError(e);
  }
}
