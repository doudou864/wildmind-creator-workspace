import { dealSuggestionInputSchema } from '@/lib/deal-model';
import { invalid,unavailable } from '@/lib/api-response';
export async function POST(request:Request){try{dealSuggestionInputSchema.parse(await request.json());}catch(error){return invalid(error);}return unavailable('商单状态建议确认服务');}
