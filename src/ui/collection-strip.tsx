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
    legacyRunning?: boolean;
    activePlatforms?: string[];
    issue: { reason?: string; at?: string } | null;
  }>('/api/collection', { running: false, issue: null }, true);
  const [starting, setStarting] = useState<string | null>(null),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
      onUpdate();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh, onUpdate]);
  async function start(platform?: string) {
    setStarting(platform ?? 'all');
    setNotice('');
    try {
      const result = await request<{
        startedPlatforms: string[];
        skippedPlatforms: string[];
        errors: { platform: string; reason: string }[];
      }>('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      setNotice(
        result.errors.length
          ? result.errors.map((e) => `${e.platform}：${e.reason}`).join('；')
          : result.startedPlatforms.length
            ? `已启动 ${result.startedPlatforms.length} 个平台，结果会自动更新`
            : '这些平台已在采集',
      );
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '启动失败');
    } finally {
      setStarting(null);
    }
  }
  return (
    <section id="data-health" className="card collection-strip" aria-label="平台采集状态">
      <div className="collection-strip-heading">
        <strong>平台采集</strong>
        <Button
          disabled={
            !!data.legacyRunning || starting !== null || platforms.every((p) => data.activePlatforms?.includes(p.id))
          }
          disabledReason={data.legacyRunning ? '旧版整批任务结束后即可并行启动' : '该平台正在采集，其他平台可单独启动'}
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
                disabled={!!data.legacyRunning || starting === 'all' || starting === p.id || !!running}
                disabledReason={
                  data.legacyRunning ? '旧版整批任务结束后即可并行启动' : '该平台正在采集，其他平台可单独启动'
                }
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
        <p role="status">
          {error ||
            data.issue?.reason ||
            (data.legacyRunning
              ? '旧版整批采集仍在运行，完成后可按平台并行；选题取材已可独立使用'
              : data.running
                ? '正在分别采集，结果会自动更新'
                : notice)}
        </p>
      )}
    </section>
  );
}
