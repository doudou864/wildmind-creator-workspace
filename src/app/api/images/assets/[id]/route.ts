import { eq } from 'drizzle-orm';
import { assets, contents } from '@/db/schema';
import { assetMetadataSchema } from '@/lib/image-model';
import { loadImageConfig } from '@/lib/image-config';
import { usingDatabase, associations } from '@/lib/media-store';
import { serviceError } from '@/lib/api-response';
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = assetMetadataSchema.parse(await request.json()),
      { id } = await context.params,
      config = await loadImageConfig();
    if (!config.purposes.some((p) => p.id === input.purposeId && p.contentMode !== 'upload'))
      throw new Error('请选择图片实际用途。');
    return Response.json(
      await usingDatabase((db) => {
        associations(db, input);
        const current = db.db.select().from(assets).where(eq(assets.id, id)).get();
        if (!current) throw new Error('素材不存在。');
        if (
          (input.contentId !== current.contentId || input.purposeId !== current.purposeId) &&
          db.db
            .select()
            .from(contents)
            .all()
            .some((c) => Object.values(c.videoCovers).includes(id))
        )
          throw new Error('请先取消作品的封面采用，再修改素材关联。');
        const result = { ...current, ...input, updatedAt: new Date().toISOString() };
        db.db.update(assets).set(result).where(eq(assets.id, id)).run();
        return result;
      }),
    );
  } catch (e) {
    return serviceError(e);
  }
}
