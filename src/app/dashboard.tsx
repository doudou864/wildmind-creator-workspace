'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { WorkspaceConfig } from '@/lib/config';
import type { DashboardData } from '@/lib/workspace-model';
import { checkpointNote, findAnomalies } from '@/lib/workspace-model';
import { dealCounts, type DealConfig, type DealData } from '@/lib/deal-model';
import type { InboxConfig } from '@/lib/inbox-model';
import { number, signed } from '@/lib/format';
import { request, useResource } from '@/ui/use-resource';
import { PageHeader, Button, Card, Dialog, Empty, Segmented } from '@/ui/components';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { Chart } from '@/ui/charts';
import { HitRates } from '@/ui/hit-rates';
import { inboxSummary } from '@/ui/inbox-summary';
import { dataDate, freshness, workTitle } from '@/ui/data-freshness';
import type { DashboardRead } from '@/ui/dashboard-read';
export default function Dashboard({
  config,
  today,
  initialData,
  initialDeals,
  dataCenterPlatformId,
  presentation,
}: {
  config: WorkspaceConfig;
  today: string;
  initialData: DashboardData;
  initialDeals: DealData;
  dataCenterPlatformId: string;
  dealConfig: DealConfig;
  dealChannels: InboxConfig['channels'];
  presentation: DashboardRead;
}) {
  const router = useRouter();
  const { data: workspace, error, refresh } = useResource('/api/dashboard', initialData);
  const { data: deals, error: dealError, refresh: refreshDeals } = useResource('/api/deals', initialDeals);
  const summary = inboxSummary(deals.messages),
    counts = dealCounts(deals.items);
  const { platforms, parameters, metrics } = config;
  const platformId = dataCenterPlatformId;
  const [range, setRange] = useState(parameters.defaultRange),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState<string | null>(null),
    [detail, setDetail] = useState<string | null>(null);
  const platform = platforms.find((p) => p.id === platformId) ?? platforms[0],
    data = workspace.platforms[platform.id];
  const metric = metrics.find((m) => m.id === platform.metrics[0])!;
  const activePlatforms = platforms.filter((p) => p.active);
  const latestUpdate = activePlatforms
    .map((p) => workspace.platforms[p.id]?.lastSuccess)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1);
  const unhealthy = activePlatforms.filter(
    (p) =>
      workspace.platforms[p.id]?.status !== 'success' ||
      !workspace.platforms[p.id]?.lastSuccess ||
      dataDate(workspace.platforms[p.id].lastSuccess!) !== today,
  );
  const failed = activePlatforms.filter((p) => workspace.platforms[p.id]?.status === 'failed');
  const planned = workspace.plannedContents.filter((c) => c.plannedDate === today);
  const pendingDeals = deals.items.filter((d) => summary.assessments.get(d.source.messageId)?.state === 'waiting');
  const oldest = pendingDeals[0],
    oldestMessage = oldest ? deals.messages.find((m) => m.id === oldest.source.messageId) : null;
  const waited = oldestMessage?.sentAt
    ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(dataDate(oldestMessage.sentAt))) / 86400000))
    : null;
  const anomalyIds = [
    ...new Set([
      ...failed.map((p) => p.id),
      ...(workspace.attention ?? []).map((a) => a.platformId),
      ...workspace.accountAlerts.map((a) => a.platformId),
    ]),
  ];
  const actions = [
    {
      label: '商单待回复',
      count: summary.dealWaiting,
      detail: oldest
        ? `${platforms.find((p) => p.id === oldest.source.platformId)?.name ?? ''} · ${oldest.brand ?? oldestMessage?.author ?? '查看商单'}${waited !== null ? ` · 已等 ${waited} 天` : ''}`
        : '查看商单消息',
      href: `/inbox?category=deal&reply=waiting${oldest ? `&message=${encodeURIComponent(oldest.source.messageId)}` : ''}`,
    },
    {
      label: '计划今天发布',
      count: planned.length,
      detail: planned.map((c) => workTitle(c.title)).join('、'),
      href: planned[0] ? `/publishing?content=${encodeURIComponent(planned[0].id)}` : '/publishing',
    },
    {
      label: '有价值私信待回复',
      count: summary.ideaDmWaiting,
      detail: '打开私信，回复具体问题',
      href: '/inbox?category=idea&channel=dm&reply=waiting',
    },
    {
      label: '有价值评论待回复',
      count: summary.ideaCommentWaiting,
      detail: '打开评论，回复求助与共鸣',
      href: '/inbox?category=idea&channel=comment&reply=waiting',
    },
    {
      label: '平台异常待处理',
      count: anomalyIds.length,
      detail: anomalyIds.map((id) => platforms.find((p) => p.id === id)?.name ?? id).join('、'),
      href: '#data-health',
    },
  ].filter((a) => a.count > 0);
  const dates = (data?.days ?? []).filter((d) => d.date < today);
  const latest = dates.at(-1),
    previous = dates.at(-2),
    value = latest?.values[metric.id];
  const previousValue =
    previous && latest && Date.parse(latest.date) - Date.parse(previous.date) === 86400000
      ? previous.values[metric.id]
      : null;
  const difference =
    value != null &&
    previousValue != null &&
    previousValue !== 0 &&
    (!latest?.precision?.[metric.id] || latest.precision[metric.id] === 'exact') &&
    (!previous?.precision?.[metric.id] || previous.precision[metric.id] === 'exact')
      ? ((value - previousValue) / Math.abs(previousValue)) * 100
      : null;
  const chartDays = dates.filter((d) => d.values[metric.id] != null);
  const ranges = parameters.timeRanges.filter((n) => chartDays.length >= n);
  const selectedRange = ranges.includes(range) ? range : ranges[0];
  const recentStart = new Date(Date.parse(today) - parameters.recentWindow * 86400000).toISOString().slice(0, 10);
  const works = (data?.works ?? []).filter((w) => w.published >= recentStart && w.published <= today);
  const columns = parameters.checkpoints.filter((d) => works.some((w) => w.checkpoints[String(d)]?.ratio != null));
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const yesterdayNet = dates.find((d) => d.date === yesterday)?.values.net_followers;
  const last30 = dates.filter((d) => d.date >= new Date(Date.parse(today) - 30 * 86400000).toISOString().slice(0, 10));
  const net30 =
    last30.length === 30 &&
    last30.every(
      (d) => d.values.net_followers != null && (!d.precision?.net_followers || d.precision.net_followers === 'exact'),
    )
      ? last30.reduce((s, d) => s + d.values.net_followers!, 0)
      : null;
  const mature = presentation.mature[platformId] ?? 0;
  const anomalies = findAnomalies(data?.works ?? [], parameters);
  async function syncTheme(theme: DashboardData['themes'][number]) {
    if (busy || !workspace.themeSyncReady || theme.signalId) return;
    setBusy(theme.id);
    try {
      await request(`/api/dashboard/themes/${encodeURIComponent(theme.id)}/topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: theme.revision }),
      });
      await refresh();
      setNotice('已送进选题');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '暂时无法保存');
    } finally {
      setBusy(null);
    }
  }
  return (
    <main className="workspace dashboard-v2">
      <WorkspaceHeader
        current="/"
        date={today}
        syncWindow={parameters.syncWindow}
        updatedLabel={`最近成功更新 · ${freshness(latestUpdate, today)}`}
      />
      <PageHeader
        title="总控台"
        summary={actions.length ? `今天先处理：${actions[0].label} ${actions[0].count}` : '挑选下一条要做的选题'}
        onRefresh={() => {
          void refresh();
          void refreshDeals();
          router.refresh();
        }}
        action={
          <Link className="button button-primary" href={actions[0]?.href ?? '/topics'}>
            {actions.length ? '处理第一件事 →' : '挑选下一条选题 →'}
          </Link>
        }
      />
      {(error || dealError || notice) && <p role="status">{error || dealError || notice}</p>}
      <div className="dashboard-two-columns">
        <div className="dashboard-left">
          {actions.length ? (
            <Card title="今日行动" className="today-primary">
              {actions.length ? (
                actions.map((a) => (
                  <Link key={a.label} className="today-action list-row" href={a.href}>
                    <span>
                      <strong>
                        {a.label} <b>{a.count}</b>
                      </strong>
                      <small>{a.detail}</small>
                    </span>
                    <span aria-hidden>→</span>
                  </Link>
                ))
              ) : (
                <Empty>今天没有待办</Empty>
              )}
            </Card>
          ) : (
            <div className="card collapsed-note today-empty">今天没有待办</div>
          )}
          <Link className="card compact-deals list-row" href="/deals">
            商单　待处理 {counts.pending} · 跟进中 {counts.following} · 已完成 {counts.completed} →
          </Link>
          <Card title="数据健康" className="health-compact">
            <div id="data-health">
              {!unhealthy.length ? (
                <p>
                  {activePlatforms.length} 个平台已更新 · {freshness(latestUpdate, today)}
                </p>
              ) : (
                unhealthy.map((p) => (
                  <div className="health-warning" key={p.id}>
                    <div>
                      <strong>{p.name}</strong>
                      <span className="accent">数据{freshness(workspace.platforms[p.id]?.lastSuccess, today)}</span>
                    </div>
                    {workspace.platforms[p.id]?.status === 'failed' && (
                      <p>
                        本次采集失败，没有读到完整数据。
                        <Button variant="text" onClick={() => setDetail(`source:${p.id}`)}>
                          查看原因
                        </Button>
                      </p>
                    )}
                    <Button disabled disabledReason="暂时不能从页面重抓；当前仍由定时采集任务执行。">
                      立即重抓
                    </Button>
                  </div>
                ))
              )}
              {summary.incomplete.length > 0 && (
                <Link className="list-row health-incomplete" href="/inbox?reply=unknown">
                  {summary.incomplete.length} 条有价值消息的回复状态没读全，去平台核对有无回复 →
                </Link>
              )}
            </div>
          </Card>
          {anomalies.length > 0 && (
            <Card title="作品表现异常">
              {anomalies.map((a) => (
                <Link
                  className="list-row today-action"
                  key={`${a.work.id}-${a.day}`}
                  href={`/data-center?post=${encodeURIComponent(a.work.id)}`}
                >
                  {workTitle(a.work.title)} · D{a.day} {a.ratio.toFixed(1)} 倍 →
                </Link>
              ))}
            </Card>
          )}
          {workspace.themes.length ? (
            <Card title="需求主题">
              {workspace.themes.length ? (
                workspace.themes.slice(0, parameters.dashboardPreviewLimit).map((t) => (
                  <div className="theme-action" key={t.id}>
                    <Link href={`/inbox?theme=${encodeURIComponent(t.id)}`}>
                      {t.title} · {t.count} 条 →
                    </Link>
                    {t.signalId ? (
                      <span>已送入选题</span>
                    ) : (
                      <Button
                        disabled={!!busy || !workspace.themeSyncReady}
                        disabledReason="当前不能保存，请稍后再试。"
                        onClick={() => void syncTheme(t)}
                      >
                        送进选题
                      </Button>
                    )}
                  </div>
                ))
              ) : (
                <Empty>暂无需求主题，读到有价值消息后会汇总到这里</Empty>
              )}
            </Card>
          ) : (
            <div className="card collapsed-note">暂无需求主题，读到有价值消息后会汇总到这里</div>
          )}
        </div>
        <div className="dashboard-right">
          {chartDays.length ? (
            <Card title={`${platform.name}趋势`} className="trend-compact">
              <div className="trend-reading">
                <strong className="mono">
                  {latest?.precision?.[metric.id] === 'display' ? '约 ' : ''}
                  {number(value)}
                </strong>
                <span>
                  {metric.name}
                  <br />
                  <time className={latest?.date !== today ? 'accent' : ''}>数据{freshness(latest?.date, today)}</time>
                </span>
                <span>
                  较前一日
                  <br />
                  {difference == null ? '—' : `${signed(difference)}%`}
                </span>
              </div>
              {chartDays.length < 7 ? (
                <p className="small">再积累 {7 - chartDays.length} 天显示趋势</p>
              ) : (
                <>
                  <Segmented
                    label="时间范围"
                    value={selectedRange}
                    onChange={setRange}
                    options={ranges.map((n) => ({ value: n, label: `${n}D` }))}
                  />
                  <Chart
                    days={chartDays.slice(-selectedRange)}
                    metric={metric.id}
                    label={metric.name}
                    kind="blocks"
                    rows={parameters.chartRows}
                  />
                </>
              )}
            </Card>
          ) : (
            <div className="card collapsed-note">暂无趋势数据，采集后开始积累</div>
          )}
          {latest?.values.followers != null ? (
            <Card title={`粉丝 · ${platform.name}`} className="fans-compact">
              <div className="fan-numbers">
                <span>
                  总数
                  <strong>
                    {latest?.precision?.followers === 'display' ? '约 ' : ''}
                    {number(latest?.values.followers)}
                  </strong>
                </span>
                <span>
                  昨日净增<strong className={(yesterdayNet ?? 0) < 0 ? 'accent' : ''}>{signed(yesterdayNet)}</strong>
                </span>
                <span>
                  30 天净增<strong>{signed(net30)}</strong>
                </span>
              </div>
              {dates.filter((d) => d.values.followers != null).length >= 7 && (
                <div className="fan-charts">
                  <Chart days={dates.slice(-30)} metric="followers" label="粉丝总数" kind="line" />
                  <Chart days={dates.slice(-30)} metric="net_followers" label="每日净增" kind="needles" />
                </div>
              )}
            </Card>
          ) : (
            <div className="card collapsed-note">暂无粉丝数据，采集后显示</div>
          )}
          {works.length ? (
            <Card
              title="近期作品"
              meta={
                <span>
                  {works.length} 条 · 近 {parameters.recentWindow} 天
                </span>
              }
              className="recent-compact"
            >
              <table className="recent-table">
                <thead>
                  <tr>
                    <th>作品</th>
                    {columns.map((d) => (
                      <th key={d}>D{d}</th>
                    ))}
                    <th>
                      当前表现{' '}
                      <span title="倍数暂缺时显示最近保存的累计值；同龄基线不足或缺少采集点的原因见作品详情。">ⓘ</span>
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {works.map((w) => {
                    const r = presentation.readings[w.id];
                    const age = r?.publishedAt
                      ? Math.max(
                          0,
                          Math.floor(
                            (Date.now() -
                              Date.parse(
                                r.publishedAt.length === 10 ? `${r.publishedAt}T00:00:00+08:00` : r.publishedAt,
                              )) /
                              86400000,
                          ),
                        )
                      : null;
                    return (
                      <tr
                        key={w.id}
                        tabIndex={0}
                        role="link"
                        aria-label={`查看作品：${workTitle(w.title)}`}
                        onClick={() =>
                          platformId === dataCenterPlatformId
                            ? router.push(`/data-center?post=${encodeURIComponent(w.id)}`)
                            : setDetail(w.id)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.click();
                        }}
                      >
                        <td>
                          <strong title={workTitle(w.title)}>{workTitle(w.title)}</strong>
                          <small>
                            {w.form} · {w.published.slice(5)}
                          </small>
                        </td>
                        {columns.map((d) => (
                          <td key={d} title={checkpointNote(w.checkpoints[String(d)])}>
                            {w.checkpoints[String(d)]?.ratio == null
                              ? '—'
                              : `${w.checkpoints[String(d)].ratio!.toFixed(1)}×`}
                          </td>
                        ))}
                        <td>
                          {r?.precision === 'display' ? '约 ' : ''}
                          {number(r?.value)} {r?.name ?? '累计值'} · 第 {age ?? '—'} 天
                          {r?.capturedAt && (
                            <small className={dataDate(r.capturedAt) !== today ? 'accent' : ''}>
                              数据{freshness(r.capturedAt, today)}
                            </small>
                          )}
                        </td>
                        <td>→</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!works.length && <Empty>暂无近期作品，采集到发布作品后会显示</Empty>}
            </Card>
          ) : (
            <div className="card collapsed-note">暂无近期作品，采集到发布作品后显示</div>
          )}
          {mature < parameters.conclusionMinimum ? (
            <div className="card collapsed-note">
              还差 {parameters.conclusionMinimum - mature} 条可计入的 D21 结果，满了开始算命中率
            </div>
          ) : (
            <HitRates data={workspace} config={config} today={today} />
          )}
        </div>
      </div>
      {detail && (
        <Dialog title={detail.startsWith('source:') ? '采集失败原因' : '作品数据'} onClose={() => setDetail(null)}>
          <p>
            {detail.startsWith('source:')
              ? workspace.platforms[detail.slice(7)]?.error
              : workTitle(works.find((w) => w.id === detail)?.title ?? '')}
          </p>
          <p>
            {!detail.startsWith('source:') && (
              <>
                当前数据中心只开放{platforms.find((p) => p.id === dataCenterPlatformId)?.name}。本平台已保存的累计值：
                {number(presentation.readings[detail]?.value)}。
              </>
            )}
          </p>
        </Dialog>
      )}
    </main>
  );
}
