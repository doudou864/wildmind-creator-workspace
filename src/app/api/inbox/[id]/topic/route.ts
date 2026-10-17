import { inboxTopicInputSchema } from '@/lib/inbox-model';
import { invalid,unavailable } from '@/lib/api-response';
export async function POST(request:Request){try{inboxTopicInputSchema.parse(await request.json());}catch(error){return invalid(error);}return unavailable('互动消息与选题输入同步服务');}
