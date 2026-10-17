import { z } from 'zod';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    z.object({})
      .strict()
      .parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('素材选定与作品采用服务');
}
