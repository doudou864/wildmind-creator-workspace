import { imageDraftSchema } from '@/lib/image-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    imageDraftSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('图片生成服务');
}
