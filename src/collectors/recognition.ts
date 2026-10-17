import { z } from 'zod';
export const metricReading = z.object({ label: z.string(), raw: z.string().nullable() });
export const screenshotReading = z.object({
  status: z.enum(['ok', 'failed']),
  reason: z.string().nullable(),
  posts: z.array(
    z.object({
      title: z.string(),
      publishedAt: z.string(),
      form: z.enum(['视频', '图文']),
      metrics: z.array(metricReading),
    }),
  ),
  account: z.object({ dataDate: z.string().nullable(), metrics: z.array(metricReading) }),
  records: z.array(
    z.object({ type: z.enum(['diagnosis', 'audience', 'viewing_times', 'traffic_sources']), text: z.string() }),
  ),
  signals: z.array(
    z.object({ type: z.enum(['search', 'after_search']), text: z.string(), share: z.string().nullable() }),
  ),
});
export type ScreenshotReading = z.infer<typeof screenshotReading>;
