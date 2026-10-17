import { contentCoverSchema } from '@/lib/content-model';
import { loadPublishingConfig } from '@/lib/publishing-config';
import { loadConfig } from '@/lib/config';
import { invalid, unavailable } from '@/lib/api-response';
export async function POST(request: Request) {
  try {
    const input = contentCoverSchema.parse(await request.json());
    const workspace = await loadConfig();
    const config = await loadPublishingConfig(workspace.platforms);
    if (!config.requiredVideoRatios.includes(input.ratio)) throw new Error('不支持的封面比例');
  } catch (e) {
    return invalid(e);
  }
  return unavailable('作品封面采用服务');
}
