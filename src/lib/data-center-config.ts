import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
export const dataCenterConfigSchema = z.object({
  platformId: z.string(),
  endDay: z.number().int().positive(),
  per: z.number().positive(),
  viewsName: z.string(),
  interactionNames: z.array(z.string()),
  interactionRateNames: z.array(z.string()),
  ai: z.object({ maxCharacters: z.number().int().positive(), prompt: z.string() }),
});
export type DataCenterConfig = z.infer<typeof dataCenterConfigSchema>;
export async function loadDataCenterConfig() {
  return dataCenterConfigSchema.parse(parse(await readFile('config/data-center.yaml', 'utf8')));
}
