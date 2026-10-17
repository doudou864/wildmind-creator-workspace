import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { dealConfigSchema } from './deal-model';
export async function loadDealConfig() {
  return dealConfigSchema.parse(parse(await readFile(path.join(process.cwd(), 'config/deals.yaml'), 'utf8')));
}
