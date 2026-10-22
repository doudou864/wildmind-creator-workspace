'use client';
import { useEffect, useState } from 'react';
import type { TopicTask } from '@/lib/topic-model';
import { Card } from './components';

export function TopicGenerationStatus({ task, starting }: { task?: TopicTask | null; starting: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  const active = task?.status === 'queued' || task?.status === 'running';
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  if (!task && !starting) return null;
  const elapsed = task && now ? Math.max(0, Math.floor((now - Date.parse(task.createdAt)) / 1000)) : 0;
  const stages = {
    queued: '正在启动采集',
    collecting: '正在采集',
    extracting: '正在提取线索',
    generating: '正在生成候选',
    saving: '正在保存候选',
    finished: '采集已完成',
  };
  const done = task?.sources.filter((s) => s.status === 'completed' || s.status === 'failed').length ?? 0;
  const problems = task?.sources.filter((s) => s.reason) ?? [];
  return (
    <Card title="本轮采集" className="topic-task-card">
      <div role="status" aria-live="polite" className="topic-task-summary">
        <strong>
          {starting && !active
            ? '正在提交采集任务…'
            : active
              ? `${stages[task.stage]}${task.currentSource ? ` · ${task.currentSource}` : ''}`
              : task?.status === 'failed'
                ? '本轮未生成候选'
                : `已生成 ${task?.count ?? 0} 个候选`}
        </strong>
        {active && (
          <span className="mono">
            已用时 {Math.floor(elapsed / 60)}分{elapsed % 60}秒
          </span>
        )}
      </div>
      {active && (
        <div className="topic-task-scan" aria-hidden="true">
          <span />
        </div>
      )}
      {task && (task.sources.length > 0 || task.sourceCount > 0) && (
        <p className="topic-task-detail">
          已处理 {done}/{task.sources.length} 个网站 · {task.sources.filter((s) => s.status === 'completed').length}{' '}
          个取得线索{task.sourceCount > 0 ? ` · 使用 ${task.sourceCount} 条线索` : ''}
        </p>
      )}
      {!!task?.cachedCount && <p>本轮使用此前保存的 {task.cachedCount} 条线索，来源日期见选题依据。</p>}
      {task?.reason && <p className="topic-task-error">{task.reason}</p>}
      {task?.warning && <p className="topic-task-error">{task.warning}</p>}
      {problems.length > 0 && (
        <details open>
          <summary>{problems.length} 个网站有情况</summary>
          <ul>
            {problems.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.name} →
                </a>
                <span>
                  {s.status === 'failed' ? '已跳过' : '部分读取'}：{s.reason}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
