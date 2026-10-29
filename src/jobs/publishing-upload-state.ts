import { z } from 'zod';
import { readState, writeState } from '../collectors/state.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
const copy = z.object({ title: z.string(), description: z.string(), tags: z.array(z.string()) });
export const uploadRunSchema = z.object({
  requestId: z.string(),
  declarations: z.object({ aiGenerated: z.boolean(), paidPromotion: z.boolean() }).optional(),
  publishAuthorization: z.object({ approvedAt: z.string(), materials: z.string() }).optional(),
  video: z.string(),
  sha256: z.string(),
  covers: z.record(z.string(), z.string()),
  platforms: z.array(
    z.object({
      id: z.string(),
      page: z.string().nullable(),
      stage: z.enum(['account', 'upload', 'wait', 'copy', 'covers', 'settings', 'review', 'ready']),
      attempted: z.boolean(),
      copyPrepared: z.boolean().default(false),
      accountVerified: z.boolean(),
      reviewObservation: z.object({ snapshot: z.string(), controls: z.array(z.unknown()).optional() }).optional(),
      copy,
      reason: z.string().nullable(),
    }),
  ),
});
export type UploadRun = z.infer<typeof uploadRunSchema>;
export function readUploadRun(db: WorkspaceDatabase, id: string) {
  const v = readState(db, 'publishing-upload:' + id);
  return v ? uploadRunSchema.parse(v) : null;
}
export function writeUploadRun(db: WorkspaceDatabase, id: string, run: UploadRun) {
  writeState(db, 'publishing-upload:' + id, run);
}
