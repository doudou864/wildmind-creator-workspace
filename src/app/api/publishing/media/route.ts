import { storePublishMedia } from '@/lib/publishing-media';
import { usingDatabase } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll('files');
    if (files.some((f) => !(f instanceof File))) throw new Error('请选择有效文件。');
    return Response.json(
      await usingDatabase((db) => storePublishMedia(db, JSON.parse(String(form.get('metadata'))), files as File[])),
    );
  } catch (e) {
    return serviceError(e);
  }
}
