import { topicDecisionInputSchema } from '@/lib/topic-model';
import { invalid,unavailable } from '@/lib/api-response';
export async function PATCH(request:Request){try{topicDecisionInputSchema.parse(await request.json());}catch(error){return invalid(error);}return unavailable('选题存储服务');}
