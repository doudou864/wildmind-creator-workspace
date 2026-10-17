import { z } from 'zod';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    z.object({ expectedRevision: z.number().int().nonnegative() })
      .strict()
      .parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('素材版本存储服务');
}
