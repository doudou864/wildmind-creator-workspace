import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { layoutConfigSchema } from './layout-model';
export async function loadLayoutConfig(){return layoutConfigSchema.parse(parse(await readFile(path.join(process.cwd(),'config/layout-styles.yaml'),'utf8')));}
