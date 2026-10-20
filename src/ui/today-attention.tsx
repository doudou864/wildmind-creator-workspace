'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { request, useResource } from './use-resource';
import { Button } from './components';
type Data = {
  warnings: { platformId: string; reason: string }[];
  newVideos: { path: string; name: string; bytes: number; duration: number }[];
  fileErrors: string[];
};
export function TodayAttention() {
  const { data, error } = useResource<Data>(
      '/api/workspace-attention',
      { warnings: [], newVideos: [], fileErrors: [] },
      true,
    ),
    router = useRouter(),
    [busy, setBusy] = useState(''),
    [failure, setFailure] = useState('');
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
      {data.newVideos.length > 0 && (
        <aside className="card today-notice">
          <strong>有新成片，要建作品吗？</strong>
          {data.newVideos.slice(0, 3).map((file) => (
            <div className="archive-row" key={file.path}>
              <span>
                {file.name} · {Math.round(file.duration)} 秒 · {(file.bytes / 1024 / 1024).toFixed(1)} MB
              </span>
              <Button
                disabled={!!busy}
                disabledReason="正在建立关联"
                onClick={async () => {
                  setBusy(file.path);
                  try {
                    const content = await request<{ contentId: string }>('/api/contents/from-video', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ file: file.path }),
                    });
                    router.push(`/create?step=publish&content=${content.contentId}`);
                  } catch (e) {
                    setFailure(String(e));
                  } finally {
                    setBusy('');
                  }
                }}
              >
                建作品并选用
              </Button>
            </div>
          ))}
          {data.newVideos.length > 3 && <a href="/publishing">还有 {data.newVideos.length - 3} 个，去选择成片 →</a>}
        </aside>
      )}
      {[error, failure, ...data.fileErrors].filter(Boolean).map((text) => (
        <p role="alert" key={text}>
          {text}
        </p>
      ))}
    </>
  );
}
