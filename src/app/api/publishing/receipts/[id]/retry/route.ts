import { publishRetrySchema } from '@/lib/publishing-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    publishRetrySchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('发布回执核对与重试服务');
}
