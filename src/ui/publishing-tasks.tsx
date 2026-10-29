'use client';
import { publishingProgress } from '@/lib/publishing-progress';
import { useState } from 'react';
import { Button, Card, Empty } from './components';
import { request } from './use-resource';
import type { PublishBatch, PublishingData } from '@/lib/publishing-model';
import { type PublishingTaskAction } from '@/lib/publishing-task-model';

export function PublishingTasks({
  data,
  selectedId,
  onNew,
  onSelect,
  onRefresh,
  onDeleted,
  platformNames = {},
  receiptStates = {},
}: {
  data: PublishingData;
  platformNames?: Record<string, string>;
  receiptStates?: Record<string, import('@/lib/publishing-model').PublishReceipt['status']>;
  selectedId: string | null;
  onNew: () => void;
  onSelect: (batch: PublishBatch) => void;
  onRefresh: () => Promise<void>;
  onDeleted: (id: string) => void;
}) {
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [rebuildId, setRebuildId] = useState<string | null>(null);
  async function control(batch: PublishBatch, action: PublishingTaskAction['action']) {
    setPending((ids) => [...ids, batch.id]);
    setError('');
    try {
      await request(`/api/publishing/drafts/${encodeURIComponent(batch.id)}/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expectedRevision: batch.revision }),
      });
      if (action === 'delete') onDeleted(batch.id);
      setRebuildId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '任务操作未完成');
    } finally {
      await onRefresh();
      setPending((ids) => ids.filter((id) => id !== batch.id));
    }
  }
  const batches = data.batches
    .filter((b) => b.draft.kind === 'video' && !b.abandonedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const legacyBatches = data.batches
    .filter((b) => b.draft.kind !== 'video')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Card title="发布任务" meta={<Button onClick={onNew}>新的一条</Button>}>
      {error && <p role="alert">{error}</p>}
      {batches.length ? (
        <div className="publishing-task-list">
          {batches.map((batch) => {
            const task = data.tasks?.find((t) => t.batchId === batch.id);
            const receipts = data.receipts
              .filter((r) => r.batchId === batch.id)
              .map((r) => ({ ...r, status: receiptStates[r.id] ?? r.status }));
            const progress = publishingProgress(
              batch.draft.settings.map((s) => s.platformId),
              receipts,
              task,
            );
            const hasSubmission = receipts.some(
              (r) => ['published', 'pending_review', 'submitting'].includes(r.status) || r.failureStage === 'publish',
            );
            const disabled = pending.includes(batch.id) || task?.status === 'deleting' || task?.status === 'pausing';
            return (
              <div key={batch.id} className="publishing-task-item">
                <button
                  className="publishing-task-select"
                  aria-current={selectedId === batch.id ? 'true' : undefined}
                  onClick={() => onSelect(batch)}
                >
                  <strong>{batch.draft.commonCopy.title || '未填写主题'}</strong>
                  <span className="small" title={task?.reason || task?.checkpoint}>
                    {progress.headline} →
                  </span>
                </button>
                <p className="publishing-task-summary" role="status">
                  {progress.summary}
                </p>
                <div className="publishing-platform-results">
                  {progress.rows.map(({ platformId, receipt, label, next }) => (
                    <details key={platformId} className="publishing-platform-result">
                      <summary>
                        <strong>{platformNames[platformId] ?? platformId}</strong>
                        <strong
                          className={
                            ['unknown', 'failed', 'expired'].includes(receipt?.status ?? '')
                              ? 'publishing-result-attention'
                              : ''
                          }
                        >
                          {label}
                        </strong>
                      </summary>
                      <div className="publishing-platform-detail">
                        <p>{next}</p>
                        {receipt?.reason && <p className="small">{receipt.reason}</p>}
                        {receipt?.url && /^https?:\/\//.test(receipt.url) && (
                          <a href={receipt.url} target="_blank" rel="noreferrer">
                            查看作品 →
                          </a>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
                <div className="video-cover-actions">
                  {task?.status === 'running' && (
                    <Button disabled={disabled} onClick={() => void control(batch, 'pause')}>
                      暂停
                    </Button>
                  )}
                  {task && ['paused', 'interrupted', 'attention'].includes(task.status) && (
                    <>
                      <Button disabled={disabled} onClick={() => void control(batch, 'resume')}>
                        {pending.includes(batch.id)
                          ? '正在恢复…'
                          : task.operation === 'publish'
                            ? '核对发布结果'
                            : '继续处理'}
                      </Button>
                      {task.operation !== 'publish' && !hasSubmission && (
                        <Button disabled={disabled} onClick={() => setRebuildId(batch.id)}>
                          重建浏览器并继续上传
                        </Button>
                      )}
                    </>
                  )}
                  <Button disabled={disabled} onClick={() => void control(batch, 'delete')}>
                    {task?.status === 'cleanup_failed' ? '重试清理' : '删除任务'}
                  </Button>
                </div>
                {rebuildId === batch.id && (
                  <div role="group" aria-label="重建上传确认">
                    <p className="small">
                      仅在原浏览器已关闭时重建，保留主题、标签、封面和视频，重新准备上传页面。平台可能留有旧草稿，不会自动删除。按你原先的上传或发布选择继续；已提交的任务不能重建。
                    </p>
                    <div className="video-cover-actions">
                      <Button disabled={disabled} onClick={() => void control(batch, 'rebuild-upload')}>
                        确认重建并继续
                      </Button>
                      <Button disabled={disabled} onClick={() => setRebuildId(null)}>
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Empty>填写新作品后自动保存为一条任务</Empty>
      )}
      {legacyBatches.length > 0 && (
        <details className="publish-legacy-history">
          <summary>历史图文发布记录 · {legacyBatches.length} 条</summary>
          <div className="publishing-task-list">
            {legacyBatches.map((batch) => (
              <button key={batch.id} className="publishing-task-select" onClick={() => onSelect(batch)}>
                <strong>{batch.draft.commonCopy.title || '未填写主题'}</strong>
                <span className="small">
                  {batch.draft.kind === 'layout' ? '排版确认稿' : '小红书图文'}
                  {batch.abandonedAt ? ' · 已放弃（回执保留）' : ''} →
                </span>
              </button>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}
