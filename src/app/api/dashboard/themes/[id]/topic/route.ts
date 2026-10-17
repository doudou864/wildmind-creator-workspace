import {themeSyncSchema} from '@/lib/workspace-model';
import {invalid,unavailable} from '@/lib/api-response';
export async function POST(request:Request){try{themeSyncSchema.parse(await request.json());}catch(e){return invalid(e);}return unavailable('需求主题选题同步服务');}
