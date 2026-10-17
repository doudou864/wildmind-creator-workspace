import { publishDraftSchema } from '@/lib/publishing-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    publishDraftSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('发布准备存储服务');
}
