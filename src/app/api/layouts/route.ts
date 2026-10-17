import { readLayouts } from '@/lib/workspace-service';
import { layoutSaveSchema } from '@/lib/layout-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function GET() {
  return Response.json(await readLayouts());
}
export async function POST(request: Request) {
  try {
    layoutSaveSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('排版稿存储服务');
}
