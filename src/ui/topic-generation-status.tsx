'use client';
import { useEffect, useState } from 'react';
import type { TopicTask } from '@/lib/topic-model';
import { Button, Card } from './components';

export function TopicGenerationStatus({
  task,
  starting,
  onRecover,
}: {
  task?: TopicTask | null;
  starting: boolean;
  onRecover?: () => void;
}) {
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
    researching: '正在寻找新来源',
    extracting: '正在提取线索',
    generating: '正在打磨观看角度',
    reviewing: '正在复核兴趣与证据',
    saving: '正在保存候选',
    finished: '采集已完成',
  };
  const done = task?.sources.filter((s) => s.status === 'completed' || s.status === 'failed').length ?? 0;
  const problems =
    task?.sources
      .map((s) =>
        !active && ['pending', 'reading'].includes(s.status)
          ? { ...s, status: 'failed', reason: '任务已中断，本页未完成读取' }
          : s,
      )
      .filter((s) => s.reason) ?? [];
  return (
    <Card
      title={task?.skillRevision ? '本轮找题' : '上次采集'}
      className={`topic-task-card ${active || starting ? 'topic-task-active' : 'topic-task-complete'}`}
    >
      <div role="status" aria-live="polite" className="topic-task-summary">
        <strong>
          {starting && !active
            ? '正在提交采集任务…'
            : active
              ? `${task.skillRevision && task.activity && task.stage === 'researching' ? task.activity : stages[task.stage]}${task.currentSource ? ` · ${task.currentSource}` : ''}`
              : task?.status === 'failed'
                ? '找题中断，尚未交付候选'
                : task?.count === 0
                  ? '研究已结束，本轮没有合格候选'
                  : `已生成 ${task?.count ?? 0} 个候选`}
        </strong>
        {active && (
          <span className="mono">
            已用时 {Math.floor(elapsed / 60)}分{elapsed % 60}秒
          </span>
        )}
      </div>
      {task?.skillRevision && (
        <p>
          使用 Skill 版本 <span className="mono">{task.skillRevision.slice(0, 8)}</span>
        </p>
      )}
      {active && (
        <div className="topic-task-scan" aria-hidden="true">
          <span />
        </div>
      )}
      {task && (task.sources.length > 0 || task.sourceCount > 0) && (
        <p className="topic-task-detail">
          {task.resumeFrom ? (
            '使用已保存材料继续判断'
          ) : (
            <>
              已处理 {done}/{task.sources.length} 个网站 · {task.sources.filter((s) => s.status === 'completed').length}{' '}
              个取得线索
            </>
          )}
          {task.sourceCount > 0
            ? ` · ${task.demandCount === undefined ? `使用 ${task.sourceCount} 条线索` : `可用网页材料 ${task.sourceCount} 份`}`
            : ''}
          {task.demandCount !== undefined && ` · 参考需求词 ${task.demandCount} 条`}
        </p>
      )}
      {!!task?.cachedCount && (
        <p>
          本轮使用此前保存的 {task.cachedCount} {task.demandCount === undefined ? '条线索' : '份网页材料'}
          ，来源日期见选题依据。
        </p>
      )}
      {task?.reason && <p className="topic-task-error">{task.reason}</p>}
      {onRecover && task?.status === 'failed' && /^浏览器操作超时|^浏览器截图超时/.test(task.reason ?? '') && (
        <Button onClick={onRecover} disabled={starting} disabledReason="正在启动">
          用已读材料继续
        </Button>
      )}
      {task?.warning && <p className="topic-task-error">{task.warning}</p>}
      {task?.status === 'completed' && task.count === 0 && task.activity && <p>{task.activity}</p>}
      {problems.length > 0 && (
        <details key={`${task?.id}:${task?.status}`} open={active || task?.status === 'failed'}>
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
