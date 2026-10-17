import { z } from 'zod';
export const contentInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    topicId: z.string().min(1).nullable(),
    form: z.enum(['视频', '图文']),
    plannedDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (value) =>
          Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
          new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
      )
      .nullable(),
  })
  .strict();
export const contentSchema = contentInputSchema.extend({
  id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  videoCovers: z.record(z.string(), z.string()).default({}),
});
export type Content = z.infer<typeof contentSchema>;
export type ContentData = {
  items: Content[];
  topics: { id: string; title: string }[];
  recordsReady: boolean;
  writeReady: boolean;
  message: string;
};
export function contentMatches(content: Content, topicId: string | null, form?: Content['form']) {
  return (!topicId || content.topicId === topicId) && (!form || content.form === form);
}

export const contentCoverSchema = z
  .object({
    ratio: z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/),
    assetId: z.string().min(1).nullable(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
