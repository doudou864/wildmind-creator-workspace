import { publishActionSchema } from '@/lib/publishing-model';
import { invalid,unavailable } from '@/lib/api-response';
export async function POST(request:Request){try{publishActionSchema.parse(await request.json());}catch(error){return invalid(error);}return unavailable('发布、配置修改与确认稿退回服务');}
