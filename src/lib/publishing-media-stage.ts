import type { PublishBatch, PublishReceipt } from './publishing-model';
export function mediaStage(batch: PublishBatch | null | undefined, receipts: PublishReceipt[]) {
  const rows = batch ? receipts.filter((r) => r.batchId === batch.id) : [];
  if (batch?.abandonedAt) return 'abandoned';
  if (rows.some((r) => ['published', 'pending_review'].includes(r.status))) return 'published';
  if (
    rows.some(
      (r) =>
        ['unknown', 'queued', 'uploading', 'submitting'].includes(r.status) ||
        (r.status === 'failed' && !r.safeToRetry),
    )
  )
    return 'blocked';
  if (batch && ['queued', 'running', 'uploading', 'finished'].includes(batch.state)) return 'blocked';
  if (rows.some((r) => r.uploadedAt || ['ready', 'expired'].includes(r.status))) return 'uploaded';
  if (batch && batch.state !== 'draft') return 'blocked';
  return 'editable';
}
