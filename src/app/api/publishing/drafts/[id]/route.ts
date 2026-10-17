import { publishUpdateSchema } from '@/lib/publishing-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function PATCH(request: Request) {
  try {
    publishUpdateSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('发布准备存储服务');
}
