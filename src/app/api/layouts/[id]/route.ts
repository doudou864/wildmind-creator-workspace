import { layoutUpdateSchema } from '@/lib/layout-model';
import { invalid,unavailable } from '@/lib/api-response';
export async function PATCH(request:Request){try{layoutUpdateSchema.parse(await request.json());}catch(error){return invalid(error);}return unavailable('排版稿存储服务');}
