import { layoutActionSchema } from '@/lib/layout-model';
import { invalid,unavailable } from '@/lib/api-response';
export async function POST(request:Request){try{layoutActionSchema.parse(await request.json());}catch(error){return invalid(error);}return unavailable('排版确认、修改与交接服务');}
