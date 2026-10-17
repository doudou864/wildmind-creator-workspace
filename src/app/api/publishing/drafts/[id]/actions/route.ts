import { publishActionSchema } from '@/lib/publishing-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    publishActionSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('平台上传、截图审核、全部发布、AI 与确认稿退回服务');
}
