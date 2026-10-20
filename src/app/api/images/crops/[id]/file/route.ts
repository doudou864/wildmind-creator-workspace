import { usingDatabase } from '@/lib/media-store';
import { imageCrops } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { assetFile, imageInfo } from '@/lib/image-files';
import { readFile } from 'node:fs/promises';
import { serviceError } from '@/lib/api-response';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params,
      row = await usingDatabase((db) => db.db.select().from(imageCrops).where(eq(imageCrops.id, id)).get());
    if (!row) return new Response('不存在', { status: 404 });
    const file = await assetFile(row.sourcePath);
    return new Response(await readFile(file), {
      headers: { 'Content-Type': (await imageInfo(file)).mime, 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return serviceError(e);
  }
}
