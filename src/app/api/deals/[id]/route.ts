import { loadDealConfig } from '@/lib/deal-config';
import { dealEditSchema } from '@/lib/deal-model';
import { invalid, unavailable } from '@/lib/api-response';
export async function PATCH(request: Request) {
  const config = await loadDealConfig();
  try {
    dealEditSchema(config).parse(await request.json());
  } catch (error) {
    return invalid(error);
  }
  return unavailable('商单保存服务');
}
