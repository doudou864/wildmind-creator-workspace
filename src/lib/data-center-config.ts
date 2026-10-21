import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
export const dataCenterConfigSchema = z.object({
  playback: z.object({
    days: z.array(z.number().int().positive()).min(1),
    timeZone: z.string(),
    axisPadding: z.number().positive(),
  }),
  platformId: z.string(),
  endDay: z.number().int().positive(),
  per: z.number().positive(),
  viewsName: z.string(),
  interactionNames: z.array(z.string()),
  interactionRateNames: z.array(z.string()),
  presentation: z.object({
    keyNames: z.array(z.string()),
    groups: z.record(z.string(), z.array(z.string())),
    equivalentRates: z.record(z.string(), z.string()),
  }),
  ai: z.object({ maxCharacters: z.number().int().positive(), prompt: z.string() }),
});
export type DataCenterConfig = z.infer<typeof dataCenterConfigSchema>;
export async function loadDataCenterConfig() {
  return dataCenterConfigSchema.parse(parse(await readFile('config/data-center.yaml', 'utf8')));
}
