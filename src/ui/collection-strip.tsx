'use client';
import { useEffect, useState } from 'react';
import { Button } from './components';
import { request, useResource } from './use-resource';
import { dataDate, freshness } from './data-freshness';
type Platform = { id: string; name: string; status?: string; lastSuccess?: string | null; reason?: string | null };
export function CollectionStrip({
  platforms,
  today,
  onUpdate,
}: {
  platforms: Platform[];
  today: string;
  onUpdate: () => void;
}) {
  const { data, error, refresh } = useResource<{
    running: boolean;
    activePlatforms?: string[];
    issue: { reason?: string; at?: string } | null;
  }>('/api/collection', { running: false, issue: null }, true);
  const [starting, setStarting] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
      onUpdate();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh, onUpdate]);
  async function start(platform?: string) {
    setStarting(true);
    setNotice('');
    try {
      await request('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      setNotice('采集已启动，结果会自动更新');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '启动失败');
    } finally {
      setStarting(false);
    }
  }
  return (
    <section id="data-health" className="card collection-strip" aria-label="平台采集状态">
      <div className="collection-strip-heading">
        <strong>平台采集</strong>
        <Button
          disabled={starting || data.running}
          disabledReason="采集正在进行，请等待完成"
          onClick={() => void start()}
        >
          全部重新采集
        </Button>
      </div>
      <div className="collection-platforms">
        {platforms.map((p) => {
          const ok = p.status === 'success' && !!p.lastSuccess && dataDate(p.lastSuccess) === today;
          const running = data.running && data.activePlatforms?.includes(p.id);
          return (
            <div className="collection-platform" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <span className={running ? '' : ok ? 'collection-success' : 'collection-failed'}>
                  ● {running ? '采集中' : ok ? '采集成功' : p.status === 'failed' ? '采集失败' : '今天未更新'}
                </span>
              </div>
              <small>{p.lastSuccess ? freshness(p.lastSuccess, today) : '尚无成功记录'}</small>
              <Button
                disabled={starting || data.running}
                disabledReason="采集正在进行，请等待完成"
                onClick={() => void start(p.id)}
              >
                重新采集
              </Button>
              {p.reason && p.status === 'failed' && (
                <details>
                  <summary>失败原因</summary>
                  <p>{p.reason}</p>
                </details>
              )}
            </div>
          );
        })}
      </div>
      {(notice || error || data.issue?.reason || data.running) && (
        <p role="status">{error || data.issue?.reason || (data.running ? '正在采集，结果会自动更新' : notice)}</p>
      )}
    </section>
  );
}
