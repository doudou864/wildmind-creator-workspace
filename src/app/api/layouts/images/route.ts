import { uploadImage, usingDatabase } from '@/lib/media-store';
import { loadImageConfig } from '@/lib/image-config';
import { serviceError } from '@/lib/api-response';
import { contents } from '@/db/schema';
import { eq } from 'drizzle-orm';
export async function POST(request: Request) {
  try {
    const form = await request.formData(),
      file = form.get('file'),
      contentId = String(form.get('contentId') ?? '');
    const config = await loadImageConfig(),
      purpose = config.purposes.find((p) => p.contentMode === 'paragraphs');
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > config.uploadMaxMB * 1024 * 1024 ||
      !config.acceptedTypes.includes(file.type as 'image/png' | 'image/jpeg') ||
      !purpose
    )
      throw Error('请选择有效的 PNG / JPEG 图片');
    const bytes = new Uint8Array(await file.arrayBuffer());
    return Response.json(
      await usingDatabase(async (db) => {
        const content = db.db.select().from(contents).where(eq(contents.id, contentId)).get();
        if (!content || content.form !== '图文') throw Error('请先关联图文作品');
        return uploadImage(
          db,
          {
            title: file.name.slice(0, 200),
            purposeId: purpose.id,
            contentId,
            topicId: content.topicId,
            prompt: '',
            parentAssetId: null,
          },
          bytes,
        );
      }),
    );
  } catch (e) {
    return serviceError(e);
  }
}
