import { imageDraftSchema } from '@/lib/image-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function PATCH(request: Request) {
  try {
    imageDraftSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('草稿存储服务');
}
