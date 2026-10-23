'use client';
import { useState } from 'react';
import { Button, Card, Empty } from './components';
import { request } from './use-resource';
import type { PublishBatch, PublishingData } from '@/lib/publishing-model';
import { publishingTaskNames, type PublishingTaskAction } from '@/lib/publishing-task-model';

export function PublishingTasks({
  data,
  selectedId,
  onNew,
  onSelect,
  onRefresh,
  onDeleted,
}: {
  data: PublishingData;
  selectedId: string | null;
  onNew: () => void;
  onSelect: (batch: PublishBatch) => void;
  onRefresh: () => Promise<void>;
  onDeleted: (id: string) => void;
}) {
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState('');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : '任务操作未完成');
    } finally {
      await onRefresh();
      setPending((ids) => ids.filter((id) => id !== batch.id));
    }
  }
  const batches = data.batches.filter((b) => !b.abandonedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Card title="上传任务" meta={<Button onClick={onNew}>新的一条</Button>}>
      {error && <p role="alert">{error}</p>}
      {batches.length ? (
        <div className="publishing-task-list">
          {batches.map((batch) => {
            const task = data.tasks?.find((t) => t.batchId === batch.id);
            const disabled = pending.includes(batch.id) || task?.status === 'deleting' || task?.status === 'pausing';
            return (
              <div key={batch.id} className="publishing-task-item">
                <button
                  className="publishing-task-select"
                  aria-current={selectedId === batch.id ? 'true' : undefined}
                  onClick={() => onSelect(batch)}
                >
                  <strong>{batch.draft.commonCopy.title || '未填写主题'}</strong>
                  <span className="small">
                    {task
                      ? task.status === 'running' && task.operation === 'publish'
                        ? '正在发布'
                        : publishingTaskNames[task.status]
                      : batch.state === 'draft'
                        ? '草稿 · 尚未上传'
                        : batch.state === 'prepared'
                          ? '上传完成 · 待审核'
                          : '查看发布状态'}{' '}
                    →
                  </span>
                </button>
                {task && (
                  <p className="small" title={task.reason || task.checkpoint}>
                    {task.reason || task.checkpoint}
                  </p>
                )}
                <div className="video-cover-actions">
                  {task?.status === 'running' && (
                    <Button disabled={disabled} onClick={() => void control(batch, 'pause')}>
                      暂停
                    </Button>
                  )}
                  {task && ['paused', 'interrupted', 'attention'].includes(task.status) && (
                    <Button disabled={disabled} onClick={() => void control(batch, 'resume')}>
                      {task.operation === 'publish' ? '核对发布结果' : '继续处理'}
                    </Button>
                  )}
                  <Button disabled={disabled} onClick={() => void control(batch, 'delete')}>
                    {task?.status === 'cleanup_failed' ? '重试清理' : '删除任务'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty>填写新作品后自动保存为一条任务</Empty>
      )}
    </Card>
  );
}
