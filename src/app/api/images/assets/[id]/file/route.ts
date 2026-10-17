import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { assets } from '@/db/schema';
import { usingDatabase } from '@/lib/media-store';
import { assetFile } from '@/lib/image-files';
import { serviceError } from '@/lib/api-response';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const asset = await usingDatabase((db) => db.db.select().from(assets).where(eq(assets.id, id)).get());
    if (!asset) return Response.json({ error: '素材不存在。' }, { status: 404 });
    return new Response(await readFile(await assetFile(asset.path)), {
      headers: {
        'Content-Type': asset.mime,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return serviceError(e);
  }
}
