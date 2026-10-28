'use client';
import { useRef, useState } from 'react';
import { request } from './use-resource';
import type { ExecutionEvent } from '../jobs/execution-log';
type Run = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  reason: string | null;
  archivePaths: string[];
};
const time = (value: string) => new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
export function CollectionHistory({ platform }: { platform: string }) {
  const [runs, setRuns] = useState<Run[]>([]),
    [events, setEvents] = useState<ExecutionEvent[] | null>(null),
    [selected, setSelected] = useState(''),
    [error, setError] = useState('');
  const sequence = useRef(0);
  async function load(id?: string) {
    const ticket = ++sequence.current;
    setError('');
    if (id) {
      setSelected(id);
      setEvents(null);
    }
    try {
      const data = await request<{ runs: Run[]; events?: ExecutionEvent[] }>(
        `/api/collection/logs?platform=${encodeURIComponent(platform)}${id ? `&id=${encodeURIComponent(id)}` : ''}`,
      );
      if (ticket !== sequence.current) return;
      setRuns(data.runs);
      if (id) setEvents(data.events ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '日志读取失败');
    }
  }
  return (
    <details
      className="collection-history"
      onToggle={(e) => {
        if (e.currentTarget.open) void load();
      }}
    >
      <summary>执行日志</summary>
      <button onClick={() => void load(selected || undefined)}>刷新日志</button>
      {error && <p role="alert">{error}</p>}
      {!runs.length && <p>暂无执行记录</p>}
      {runs.map((run) => (
        <div key={run.id}>
          <button onClick={() => void load(run.id)}>
            {time(run.startedAt)} · {run.status === 'success' ? '成功' : run.status === 'running' ? '执行中' : '未完成'}
          </button>
          {selected === run.id && (
            <div>
              <p>记录：{run.id}</p>
              <p>
                {run.finishedAt
                  ? `结束：${time(run.finishedAt)} · 耗时 ${Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000)} 秒`
                  : '尚未结束'}
              </p>
              {run.reason && <p>{run.reason}</p>}
              <details>
                <summary>已存档 {run.archivePaths.length} 个文件</summary>
                {run.archivePaths.map((file) => (
                  <p key={file}>{file}</p>
                ))}
              </details>
              {events === null ? (
                <p>正在读取步骤</p>
              ) : !events.length ? (
                <p>此记录没有步骤日志（日志功能上线前的记录不会补造）</p>
              ) : (
                <ol>
                  {events.map((event, i) => (
                    <li key={i}>
                      {time(event.at)} · {event.step} ·{' '}
                      {event.status === 'started' ? '开始' : event.status === 'success' ? '完成' : '失败'}
                      {event.elapsedMs !== undefined ? ` · ${event.elapsedMs} 毫秒` : ''}
                      {event.detail && <pre>{event.detail}</pre>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      ))}
    </details>
  );
}
