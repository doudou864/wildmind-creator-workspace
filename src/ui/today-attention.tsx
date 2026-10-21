'use client';
import { useResource } from './use-resource';
type Data = {
  warnings: { platformId: string; reason: string }[];
};
export function TodayAttention() {
  const { data, error } = useResource<Data>('/api/workspace-attention', { warnings: [] }, true);
  return (
    <>
      {data.warnings.length > 0 && (
        <aside className="card today-notice" role="status">
          <strong>采集需要处理</strong>
          <details>
            <summary>{new Set(data.warnings.map((w) => w.platformId)).size} 个平台需要检查 →</summary>
            {data.warnings.map((w) => (
              <p key={w.reason}>{w.reason}</p>
            ))}
          </details>
          <a href="#data-health">查看数据健康 →</a>
        </aside>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
