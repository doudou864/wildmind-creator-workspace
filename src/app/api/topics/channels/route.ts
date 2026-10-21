import { loadTopicChannels, editTopicChannel } from '@/lib/topic-channels';
import { serviceError } from '@/lib/api-response';
export async function GET() {
  try {
    const { channels, revision } = await loadTopicChannels();
    return Response.json({ channels, revision });
  } catch (e) {
    return serviceError(e);
  }
}
export async function POST(request: Request) {
  try {
    const { channels, revision } = await editTopicChannel(await request.json());
    return Response.json({ channels, revision });
  } catch (e) {
    return serviceError(e);
  }
}
