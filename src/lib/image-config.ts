import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { imageConfigSchema } from './image-model';
export async function loadImageConfig() {
  const config=imageConfigSchema.parse(parse(await readFile(path.join(process.cwd(),'config/image-styles.yaml'),'utf8')));
  for(const list of [config.styles,config.purposes]) if(new Set(list.map(item=>item.id)).size!==list.length) throw new Error('生图配置 ID 重复');
  if(config.purposes.filter(p=>p.contentMode==='upload').length!==1) throw new Error('生图配置必须包含一个上传用途');
  if(config.purposes.some(p=>p.contentMode!=='upload' && (!p.ratios.length || p.ratios.some(r=>r.split(':').some(n=>Number(n)<=0))))) throw new Error('生图输出比例必须为正数，且不可留空');
  return config;
}
