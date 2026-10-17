import { publishAiSchema } from '@/lib/publishing-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    publishAiSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('AI 文案服务');
}
