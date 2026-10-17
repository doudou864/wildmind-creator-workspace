import {assetMetadataSchema} from '@/lib/image-model';
import {loadImageConfig} from '@/lib/image-config';
import {invalid,unavailable} from '@/lib/api-response';
export async function PATCH(request:Request){try{const input=assetMetadataSchema.parse(await request.json());const config=await loadImageConfig();if(!config.purposes.some(p=>p.id===input.purposeId&&p.contentMode!=='upload'))throw new Error('请选择实际图片用途');}catch(e){return invalid(e);}return unavailable('素材信息保存服务');}
