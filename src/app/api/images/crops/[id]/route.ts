import { usingDatabase } from '@/lib/media-store';
import { saveManualCrop } from '@/lib/manual-crop';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params,
      body = await request.json();
    return Response.json(await usingDatabase((db) => saveManualCrop(db, id, body)));
  } catch (e) {
    return serviceError(e);
  }
}
