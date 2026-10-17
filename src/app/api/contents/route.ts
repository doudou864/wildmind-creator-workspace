import { readContents } from '@/lib/workspace-service';
import { contentInputSchema } from '@/lib/content-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function GET() {
  return Response.json(await readContents());
}
export async function POST(request: Request) {
  try {
    contentInputSchema.parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('作品存储服务');
}
