'use client';
import { CollectionHistory } from './collection-history';
import { useEffect, useState } from 'react';
import { Button } from './components';
import { request, useResource } from './use-resource';
import { dataDate, freshness } from './data-freshness';
type Platform = {
  id: string;
  name: string;
  status?: string;
  lastSuccess?: string | null;
  reason?: string | null;
  dataPending?: { through: string; note: string };
};
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
    today?: string;
    manualOnly?: string[];
    attention?: { platform: string; reason: string; at: string }[];
    running: boolean;
    legacyRunning?: boolean;
    activePlatforms?: string[];
    issue: { reason?: string; at?: string } | null;
  }>('/api/collection', { running: false, issue: null }, true);
  const currentDate = data.today ?? today;
  const [starting, setStarting] = useState<string | null>(null),
    [notice, setNotice] = useState(''),
    [stopping, setStopping] = useState<string[]>([]);
  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
      onUpdate();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh, onUpdate]);
  useEffect(() => {
    if (stopping.length && stopping.every((id) => !data.activePlatforms?.includes(id)) && !data.legacyRunning) {
      setNotice('已停止，已完成的数据保留');
      setStopping([]);
    }
  }, [data.activePlatforms, data.legacyRunning, stopping]);
  useEffect(() => {
    if (!data.running && notice.startsWith('已启动')) setNotice('本轮执行已结束，请查看各平台结果');
  }, [data.running, notice]);
  async function stop(platform?: string) {
    try {
      await request('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', platform }),
      });
      setStopping((current) => [...new Set([...current, ...(platform ? [platform] : platforms.map((p) => p.id))])]);
      setNotice('已发送停止请求，已完成的数据保留');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '停止失败');
    }
  }
  async function start(platform?: string, resume = false) {
    setStarting(platform ?? 'all');
    setNotice('');
    setStopping([]);
    try {
      const result = await request<{
        startedPlatforms: string[];
        skippedPlatforms: string[];
        errors: { platform: string; reason: string }[];
      }>('/api/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, ...(resume ? { action: 'resume' } : {}) }),
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
        {data.running && <Button onClick={() => void stop()}>停止全部采集</Button>}
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
          const ok = p.status === 'success' && !!p.lastSuccess && dataDate(p.lastSuccess) === currentDate;
          const blocked = data.attention
            ?.filter((item) => item.platform === p.id)
            .sort((a, b) => b.at.localeCompare(a.at))[0];
          const running = data.running && data.activePlatforms?.includes(p.id);
          return (
            <div className="collection-platform" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <span className={running ? '' : ok ? 'collection-success' : 'collection-failed'}>
                  ●{' '}
                  {running
                    ? stopping.includes(p.id)
                      ? '正在停止'
                      : '采集中'
                    : blocked
                      ? '等待处理'
                      : p.reason === '已停止本次采集'
                        ? '已停止'
                        : ok
                          ? '采集成功'
                          : p.status === 'failed'
                            ? '采集失败'
                            : '今天未更新'}
                </span>
              </div>
              <small>{p.lastSuccess ? freshness(p.lastSuccess, currentDate) : '尚无成功记录'}</small>
              {blocked && (
                <p>
                  {blocked.reason}（{dataDate(blocked.at)}）
                </p>
              )}
              {data.manualOnly?.includes(p.id) && <small>仅手动采集</small>}
              <CollectionHistory platform={p.id} />
              {p.status === 'success' && p.dataPending && (
                <small>平台数据更新至 {p.dataPending.through.slice(5)}，等待更新</small>
              )}
              <Button
                disabled={!!data.legacyRunning || starting === 'all' || starting === p.id || !!running}
                disabledReason={
                  data.legacyRunning ? '旧版整批任务结束后即可并行启动' : '该平台正在采集，其他平台可单独启动'
                }
                onClick={() => void start(p.id, !!blocked)}
              >
                {blocked ? '已处理，恢复采集' : '重新采集'}
              </Button>
              {running && (
                <Button
                  disabled={stopping.includes(p.id)}
                  disabledReason="停止请求已发送"
                  onClick={() => void stop(p.id)}
                >
                  {data.legacyRunning ? '停止本轮采集' : '停止采集'}
                </Button>
              )}
              {p.reason && p.status === 'failed' && p.reason !== '已停止本次采集' && (
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
            notice ||
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
