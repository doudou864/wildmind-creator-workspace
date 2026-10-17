import { uploadImage, usingDatabase } from '@/lib/media-store';
import { z } from 'zod';
import { loadImageConfig } from '@/lib/image-config';
import { serviceError } from '@/lib/api-response';
const metadataSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    purposeId: z.string().min(1),
    topicId: z.string().nullable(),
    contentId: z.string().nullable(),
    prompt: z.string().max(20000),
    parentAssetId: z.string().nullable(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    const body = await request.formData();
    const metadata = metadataSchema.parse(JSON.parse(String(body.get('metadata'))));
    const file = body.get('file');
    const config = await loadImageConfig();
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > config.uploadMaxMB * 1024 * 1024 ||
      !config.acceptedTypes.includes(file.type as 'image/png' | 'image/jpeg')
    )
      throw new Error('请选择有效的 PNG / JPEG 图片');
    if (!config.purposes.some((p) => p.id === metadata.purposeId && p.contentMode !== 'upload'))
      throw new Error('请选择图片实际用途');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return Response.json(await usingDatabase((db) => uploadImage(db, metadata, bytes)));
  } catch (e) {
    return serviceError(e);
  }
}
