'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { dealActionGroups, dealCounts, type DealConfig, type DealData } from '@/lib/deal-model';
import { assessReplies, waitingCount, replyUnit, type InboxConfig } from '@/lib/inbox-model';
import { useMemo, useState, type ReactNode } from 'react';
import type { WorkspaceConfig, Platform } from '@/lib/config';
import { checkpointNote, findAnomalies, type DashboardData, type Work } from '@/lib/workspace-model';
import { request, useResource } from '@/ui/use-resource';
import { HitRates } from '@/ui/hit-rates';
import { dateLabel, number, signed, lastSuccessTimeLabel } from '@/lib/format';
import { PageHeader, Tag, Button, Card, Dialog, Empty, Ratio, Segmented } from '@/ui/components';
import { Chart } from '@/ui/charts';

import { WorkspaceHeader } from '@/ui/workspace-header';
type Modal = { type: 'source'; platform: Platform } | { type: 'work'; work: Work } | { type: 'attention' } | null;

export default function Dashboard({
  config,
  today,
  initialData,
  dealConfig,
  dealChannels,
  initialDeals,
  dataCenterPlatformId,
}: {
  dataCenterPlatformId: string;
  dealConfig: DealConfig;
  dealChannels: InboxConfig['channels'];
  initialDeals: DealData;
  config: WorkspaceConfig;
  today: string;
  initialData: DashboardData;
}) {
  const router = useRouter();
  const { data: workspace, error, refresh } = useResource('/api/dashboard', initialData);
  const { data: deals, error: dealError, refresh: refreshDeals } = useResource('/api/deals', initialDeals);
  const counts = dealCounts(deals.items),
    replies = assessReplies(deals.messages);
  const actions = dealActionGroups(deals.items, deals.messages, replies);
  const { platforms, metrics, parameters } = config;
  const [themeBusy, setThemeBusy] = useState<string | null>(null),
    [themeNotice, setThemeNotice] = useState('');
  const [themeReceipts, setThemeReceipts] = useState<Record<string, string>>({});
  const pendingDealReplies = actions.filter((g) => replies.get(g.message.id)?.state === 'waiting').length;
  const pendingIdeaReplies = waitingCount(
    deals.messages.filter((m) => m.classification.status === 'ready' && m.classification.result.category === 'idea'),
    deals.messages,
  );
  const planned = workspace.plannedContents.filter((c) => c.plannedDate === today);
  const actionsReady =
    workspace.collectionReady &&
    deals.recordsReady &&
    workspace.questionsReady &&
    workspace.plansReady &&
    workspace.accountAlertsReady;
  async function syncTheme(theme: DashboardData['themes'][number]) {
    if (!workspace.themeSyncReady || themeBusy || theme.signalId || themeReceipts[theme.id]) return;
    setThemeBusy(theme.id);
    try {
      const result = await request<{ themeId: string; signalId: string }>(
        `/api/dashboard/themes/${encodeURIComponent(theme.id)}/topic`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision: theme.revision }),
        },
      );
      if (result.themeId !== theme.id || !result.signalId) throw new Error('同步结果未确认，请刷新核对');
      setThemeReceipts((r) => ({ ...r, [theme.id]: result.signalId }));
      setThemeNotice('需求主题已作为选题输入保存。');
      await refresh();
    } catch (e) {
      setThemeNotice(e instanceof Error ? e.message : '同步失败');
    } finally {
      setThemeBusy(null);
    }
  }

  const [platformId, setPlatformId] = useState(platforms[0].id);
  const [range, setRange] = useState(parameters.defaultRange);
  const [metricId, setMetricId] = useState(platforms[0].metrics[0]);
  const [form, setForm] = useState('全部');
  const [modal, setModal] = useState<Modal>(null);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const platform = platforms.find((item) => item.id === platformId)!;
  const metric = metrics.find((item) => item.id === metricId)!;
  const data = workspace.platforms[platformId];
  const displayDate = today;
  const days = useMemo(() => {
    if (!data) return [];
    const start = new Date(`${displayDate}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - range);
    return data.days.filter((day) => day.date >= start.toISOString().slice(0, 10) && day.date < displayDate);
  }, [data, range, displayDate]);
  const latest = data?.days.at(-1);
  const previous = data?.days.at(-2);
  const currentValue = latest?.values[metricId];
  const previousValue =
    previous && latest && Date.parse(latest.date) - Date.parse(previous.date) === 86400000
      ? previous.values[metricId]
      : null;
  const difference =
    currentValue != null &&
    previousValue != null &&
    previousValue !== 0 &&
    (latest?.precision?.[metricId] === undefined || latest.precision[metricId] === 'exact') &&
    (previous?.precision?.[metricId] === undefined || previous.precision[metricId] === 'exact')
      ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100
      : null;
  const netValues = days.map((day) =>
    day.precision?.net_followers === 'display' || day.precision?.net_followers === 'unknown'
      ? null
      : day.values.net_followers,
  );
  const periodNet =
    days.length === range && netValues.every((value) => value != null)
      ? netValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
  const visiblePlatforms = showAllPlatforms
    ? platforms
    : platforms.filter((item) => item.active || item.id === platformId);
  const healthPlatforms = platforms.filter((item) => item.active);
  const failedPlatforms = healthPlatforms.filter((item) => workspace.platforms[item.id]?.status === 'failed');
  const recentStart = new Date(`${displayDate}T00:00:00Z`);
  recentStart.setUTCDate(recentStart.getUTCDate() - parameters.recentWindow);
  const works =
    data?.works.filter(
      (work) =>
        work.published >= recentStart.toISOString().slice(0, 10) &&
        work.published <= displayDate &&
        (form === '全部' || work.form === form),
    ) ?? [];
  const anomalies = findAnomalies(data?.works ?? [], parameters);
  const changePlatform = (id: string) => {
    const next = platforms.find((item) => item.id === id)!;
    setPlatformId(id);
    setMetricId(next.metrics[0]);
    setForm('全部');
  };
  const lastSuccessLabel = (id: string) => {
    const source = workspace.platforms[id];
    if (!source?.lastSuccess) return '--';
    return lastSuccessTimeLabel(source.lastSuccess, displayDate);
  };
  let dialogContent: ReactNode = null;
  let dialogTitle = '';
  if (modal?.type === 'attention') {
    dialogTitle = '平台异常待处理';
    dialogContent = (
      <div>
        {[
          ...new Set([
            ...failedPlatforms.map((p) => p.id),
            ...(workspace.attention ?? []).map((a) => a.platformId),
            ...workspace.accountAlerts.map((a) => a.platformId),
          ]),
        ].map((id) => (
          <section key={id}>
            <h3>{platforms.find((p) => p.id === id)?.name ?? id}</h3>
            {[
              ...new Set(
                [
                  workspace.platforms[id]?.status === 'failed' ? workspace.platforms[id].error : null,
                  ...(workspace.attention ?? []).filter((a) => a.platformId === id).map((a) => a.reason),
                  ...workspace.accountAlerts.filter((a) => a.platformId === id).map((a) => a.reason),
                ].filter(Boolean),
              ),
            ].map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </section>
        ))}
      </div>
    );
  } else if (modal?.type === 'source') {
    const source = workspace.platforms[modal.platform.id];
    dialogTitle = `${modal.platform.name} · 采集状态`;
    dialogContent = (
      <>
        <p className="dialog-intro">{workspace.collectionReady ? '最近一次采集状态。' : '暂无采集日志。'}</p>
        <dl className="detail-list">
          <div>
            <dt>采集方式</dt>
            <dd>{modal.platform.collection}</dd>
          </div>
          <div>
            <dt>最近成功</dt>
            <dd className="mono">{source?.lastSuccess?.replace('T', ' ').replace('+08:00', '') ?? '--'}</dd>
          </div>
          <div>
            <dt>当前状态</dt>
            <dd>
              {source?.status === 'failed' ? '采集失败' : source?.status === 'success' ? '采集成功' : '今日尚未抓取'}
            </dd>
          </div>
          <div>
            <dt>失败原因</dt>
            <dd>{source?.error ?? '--'}</dd>
          </div>
          <div>
            <dt>计划时段</dt>
            <dd className="mono">{parameters.syncWindow}</dd>
          </div>
          <div>
            <dt>计划重试</dt>
            <dd className="mono">{parameters.retryTimes.join(' / ')}</dd>
          </div>
        </dl>

        <Button disabled disabledReason="重抓操作尚不可用。">
          立即重抓
        </Button>
      </>
    );
  } else if (modal?.type === 'work') {
    const work = modal.work;
    dialogTitle = work.title;
    dialogContent = (
      <>
        <p className="dialog-intro">
          {platform.name} · {work.form} · {work.published} 发布
        </p>
        <dl className="detail-list">
          <div>
            <dt>当前走势</dt>
            <dd>{work.state}</dd>
          </div>
          <div>
            <dt>复盘主指标</dt>
            <dd>{platform.reviewMetric}</dd>
          </div>
        </dl>
        <div className="checkpoint-details">
          {[...new Set([...parameters.anomalyCheckpoints, ...parameters.checkpoints])]
            .sort((a, b) => a - b)
            .map((day) => {
              const point = work.checkpoints[String(day)];
              return (
                <section key={day}>
                  <h3>
                    D{day} <span className="small">{checkpointNote(point)}</span>
                  </h3>
                  <Ratio value={point?.status === 'ready' ? point.ratio : null} parameters={parameters} />
                  <dl className="detail-list">
                    <div>
                      <dt>当时同龄基线</dt>
                      <dd>{number(point?.baseline)}</dd>
                    </div>
                    <div>
                      <dt>有效样本数</dt>
                      <dd>{number(point?.samples)}</dd>
                    </div>
                    <div>
                      <dt>实际采集时间</dt>
                      <dd>{point?.capturedAt ?? '--'}</dd>
                    </div>
                  </dl>
                </section>
              );
            })}
        </div>
      </>
    );
  }
  return (
    <main className="workspace">
      <WorkspaceHeader current="/" date={displayDate} syncWindow={parameters.syncWindow} />
      <PageHeader
        title="总控台"
        summary={
          deals.recordsReady
            ? pendingDealReplies || pendingIdeaReplies || planned.length
              ? `${pendingDealReplies} 条商单待回复，${pendingIdeaReplies} 条价值消息待回复${planned.length ? `，${planned.length} 条计划待发布` : ''}`
              : '查看待核对消息和平台状态，安排下一条作品'
            : '先查看数据更新，确认采集结果'
        }
        onRefresh={() => {
          void refresh();
          void refreshDeals();
        }}
        action={
          <Button variant="primary" onClick={() => setModal({ type: 'attention' })}>
            查看待处理
          </Button>
        }
      />
      {(error || dealError) && (
        <p role="alert" className="topic-feedback">
          {error || dealError}
        </p>
      )}
      <section className="card health" aria-label="数据健康">
        <div className="health-heading">
          <h2 className="eyebrow">数据更新</h2>
          <span className="eyebrow">最近成功更新</span>
        </div>
        <div className="health-grid">
          {healthPlatforms.map((item) => {
            const source = workspace.platforms[item.id];
            const status = source?.status ?? 'pending';
            return (
              <div className={`health-item ${status}`} key={item.id}>
                <Button
                  className="source-button list-row"
                  onClick={() => setModal({ type: 'source', platform: item })}
                  aria-label={`${item.name}采集状态：${status === 'failed' ? '失败' : status === 'success' ? '成功' : '尚未抓取'}`}
                >
                  <span className="status-dot" aria-hidden="true">
                    {status === 'success' ? '◉' : status === 'failed' ? '●' : '○'}
                  </span>
                  <span className="source-name">
                    <b className="mono">{item.code}</b>
                    <span>{item.name}</span>
                  </span>
                  <time className="mono" dateTime={source?.lastSuccess ?? undefined}>
                    {lastSuccessLabel(item.id)}
                  </time>
                </Button>
                {status === 'failed' && (
                  <Button className="retry" onClick={() => setModal({ type: 'source', platform: item })}>
                    重抓
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {failedPlatforms.length > 0 && (
          <div className="health-error">
            <span className="error-label">采集失败</span>
            {failedPlatforms.map((item) => `${item.name}：${workspace.platforms[item.id].error}`).join('；')}
          </div>
        )}
      </section>
      <div className="dashboard-grid">
        <div className="left-column">
          <Card title="今日行动" meta={<span className="eyebrow">待办汇总</span>} className="actions-card">
            {[
              {
                label: '商单待回复',
                count: actions.filter((g) => replies.get(g.message.id)?.state === 'waiting').length,
                ready: deals.recordsReady,
                href: '/inbox?category=deal&reply=waiting',
                note: '按会话汇总',
              },
              {
                label: '价值评论待回复',
                count: waitingCount(
                  deals.messages.filter(
                    (m) =>
                      m.channel === 'comment' &&
                      m.classification.status === 'ready' &&
                      m.classification.result.category === 'idea',
                  ),
                  deals.messages,
                ),
                ready: deals.recordsReady,
                href: '/inbox?category=idea&channel=comment&reply=waiting',
                note: '具体求助 / 高互动评论',
              },
              {
                label: '价值私信待回复',
                count: waitingCount(
                  deals.messages.filter(
                    (m) =>
                      m.channel === 'dm' &&
                      m.classification.status === 'ready' &&
                      m.classification.result.category === 'idea',
                  ),
                  deals.messages,
                ),
                ready: deals.recordsReady,
                href: '/inbox?category=idea&channel=dm&reply=waiting',
                note: '按会话汇总',
              },
              {
                label: '商单回复待核对',
                count: actions.filter((g) => replies.get(g.message.id)?.state === 'unknown').length,
                ready: deals.recordsReady,
                href: '/inbox?category=deal&reply=unknown',
                note: '回复记录不完整',
              },
              {
                label: '价值消息回复待核对',
                count: new Set(
                  deals.messages
                    .filter(
                      (m) =>
                        m.classification.status === 'ready' &&
                        m.classification.result.category === 'idea' &&
                        replies.get(m.id)?.state === 'unknown',
                    )
                    .map(replyUnit),
                ).size,
                ready: deals.recordsReady,
                href: '/inbox?category=idea&reply=unknown',
                note: '回复记录不完整',
              },
              {
                label: '今日计划发布',
                count: planned.length,
                ready: workspace.plansReady,
                href: '/publishing',
                note: '查看发布准备',
              },
            ]
              .filter((row) => !row.ready || row.count > 0)
              .map((row) => (
                <Link className="action-row action-summary list-row" href={row.href} key={row.label}>
                  <span>
                    <strong>{row.label}</strong>
                  </span>
                  <span className="action-count mono">{row.ready ? number(row.count) : '--'}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            {(failedPlatforms.length > 0 ||
              (workspace.attention?.length ?? 0) > 0 ||
              workspace.accountAlerts.length > 0) && (
              <Button className="action-row action-summary list-row" onClick={() => setModal({ type: 'attention' })}>
                <span>
                  <strong>平台异常待处理</strong>
                </span>
                <span className="action-count mono">
                  {
                    new Set([
                      ...failedPlatforms.map((p) => p.id),
                      ...(workspace.attention ?? []).map((a) => a.platformId),
                      ...workspace.accountAlerts.map((a) => a.platformId),
                    ]).size
                  }
                </span>
                <span aria-hidden="true">→</span>
              </Button>
            )}
            {!actions.length &&
              !failedPlatforms.length &&
              !workspace.questions.length &&
              !planned.length &&
              !workspace.accountAlerts.length &&
              !workspace.attention?.length && (
                <Empty>{actionsReady ? '今天没有待办' : '待办资料尚未齐备，暂不能判断今天是否有事'}</Empty>
              )}
          </Card>
          <Card
            title="商单"
            meta={
              <Link className="text-button eyebrow" href="/deals">
                查看全部 →
              </Link>
            }
          >
            <div className="deal-counts deal-dashboard-counts">
              {dealConfig.statuses.map((state) => (
                <Link key={state.id} href={`/deals?status=${state.id}`}>
                  <strong
                    className={`mono ${state.id === 'pending' && deals.recordsReady && counts.pending > 0 ? 'deal-attention' : ''}`}
                  >
                    {deals.recordsReady ? number(counts[state.id]) : '--'}
                  </strong>
                  <span>{state.name} →</span>
                </Link>
              ))}
            </div>
          </Card>
          <Card title="洞察与异常" className="insights-card">
            <p className="section-label">需求主题</p>
            {workspace.themes.length ? (
              workspace.themes.slice(0, parameters.dashboardPreviewLimit).map((theme) => (
                <div className="insight-row" key={theme.id}>
                  <Link href={`/inbox?theme=${encodeURIComponent(theme.id)}`}>
                    {theme.title} →<small>{theme.count} 条来源</small>
                  </Link>
                  {theme.signalId || themeReceipts[theme.id] ? (
                    <Tag>已送入选题</Tag>
                  ) : (
                    <Button
                      disabled={
                        !workspace.themeSyncReady || !!themeBusy || !!theme.signalId || !!themeReceipts[theme.id]
                      }
                      disabledReason={
                        !workspace.themeSyncReady
                          ? '选题同步暂不可用。'
                          : theme.signalId || themeReceipts[theme.id]
                            ? '已送入选题，无需重复同步。'
                            : '正在同步，请稍候。'
                      }
                      onClick={() => void syncTheme(theme)}
                    >
                      送进选题
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <Empty>{workspace.themesReady ? '暂无需求主题' : '尚无需求主题，读取消息后生成'}</Empty>
            )}
            {themeNotice && (
              <p role="status" className="small">
                {themeNotice}
              </p>
            )}
            <p className="section-label anomaly-heading">账号异常</p>
            {workspace.accountAlerts.length ? (
              workspace.accountAlerts.map((alert) => (
                <div key={alert.id} className="insight-row">
                  <span>
                    {platforms.find((p) => p.id === alert.platformId)?.name ?? alert.platformId} · {alert.title}
                    <small>
                      {alert.reason} · {alert.capturedAt}
                    </small>
                    {alert.sourceUrl && /^https?:\/\//.test(alert.sourceUrl) && (
                      <a href={alert.sourceUrl} target="_blank" rel="noreferrer">
                        查看平台证据 →
                      </a>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <Empty>{workspace.accountAlertsReady ? '暂无账号异常' : '尚无账号异常记录'}</Empty>
            )}
            <p className="section-label anomaly-heading">作品异常 · {platform.name}</p>
            {anomalies.length ? (
              anomalies.map(({ work, day, ratio }) => (
                <Button
                  key={`${work.id}-${day}`}
                  className="insight-row"
                  onClick={() =>
                    platform.id === dataCenterPlatformId
                      ? router.push(`/data-center?post=${encodeURIComponent(work.id)}`)
                      : setModal({ type: 'work', work })
                  }
                >
                  <span className="tag">{ratio > parameters.anomalyHigh ? 'HOT' : 'DROP'}</span>
                  <span>
                    {work.title}
                    <small>
                      D{day} 达基线 {number(ratio, 1)}× · 查看详情 →
                    </small>
                  </span>
                </Button>
              ))
            ) : (
              <Empty>暂无作品异常</Empty>
            )}
          </Card>
        </div>
        <div className="center-column">
          <Card
            title="平台趋势"
            meta={
              <Segmented
                label="时间范围"
                value={range}
                onChange={setRange}
                options={parameters.timeRanges.map((value) => ({ value, label: `${value}D` }))}
              />
            }
            className="trend-card"
          >
            <div className="trend-summary">
              <div className="hero-stat">
                <strong className={`mono ${metricId === 'net_followers' && (currentValue ?? 0) < 0 ? 'negative' : ''}`}>
                  {latest?.precision?.[metricId] === 'display' ? '约 ' : ''}
                  {number(currentValue)}
                </strong>
                <span>
                  {latest ? `${dateLabel(latest.date)} · ` : ''}
                  {metric.name} · {platform.name}
                </span>
              </div>
              <div className="baseline-stat">
                <span>D21 基线 · {platform.forms[0]}</span>
                <strong className="mono">{number(data?.baselines[platform.forms[0]])}</strong>
                {platform.forms.length > 1 && <small>图文 {number(data?.baselines['图文'])}</small>}
              </div>
              <div className="compare-stat">
                <span>较前一日</span>
                <strong className="mono">
                  {difference == null ? '--' : `${difference > 0 ? '+' : ''}${number(difference, 1)}%`}
                </strong>
                <small>{metric.unit} / 日</small>
              </div>
            </div>
            <div className="platform-controls">
              <Segmented
                label="平台"
                value={platformId}
                onChange={changePlatform}
                options={visiblePlatforms.map((item) => ({ value: item.id, label: item.name }))}
              />
              <Button
                aria-expanded={showAllPlatforms}
                className="platform-more"
                variant="text"
                onClick={() => setShowAllPlatforms(!showAllPlatforms)}
              >
                {showAllPlatforms ? '收起' : '更多平台 +'}{' '}
              </Button>
            </div>
            <div className="metric-controls">
              <label htmlFor="trend-metric">趋势指标</label>
              <select id="trend-metric" value={metricId} onChange={(event) => setMetricId(event.target.value)}>
                {platform.metrics.map((id) => (
                  <option key={id} value={id}>
                    {metrics.find((item) => item.id === id)!.name}
                  </option>
                ))}
              </select>
              <span className="small">{metric.level === 'core' ? '核心指标' : '次核心指标'} · 账号日数据</span>
            </div>
            {days.length ? (
              <Chart days={days} metric={metricId} label={metric.name} kind="blocks" rows={parameters.chartRows} />
            ) : (
              <div className="chart-empty">
                <Empty>{platform.active ? '暂无趋势数据' : '该平台尚未开始运营'}</Empty>
              </div>
            )}
          </Card>
          <Card title="近期作品" meta={<span className="eyebrow">{works.length} 条</span>} className="works-card">
            <div className="works-toolbar">
              <span className="small">
                近 {parameters.recentWindow} 天 · {platform.name} · {works.length} 条
              </span>
              <Segmented
                label="内容形式"
                value={form}
                onChange={setForm}
                options={['全部', ...platform.forms].map((value) => ({ value, label: value }))}
              />
            </div>
            <table className="works-table">
              <thead>
                <tr>
                  <th>作品</th>
                  {parameters.checkpoints.map((point) => (
                    <th key={point}>D{point}</th>
                  ))}
                  <th>走势</th>
                </tr>
              </thead>
              <tbody>
                {works.map((work) => (
                  <tr
                    key={work.id}
                    data-clickable
                    tabIndex={0}
                    role="link"
                    aria-label={`查看作品：${work.title}`}
                    onClick={() =>
                      platform.id === dataCenterPlatformId
                        ? router.push(`/data-center?post=${encodeURIComponent(work.id)}`)
                        : setModal({ type: 'work', work })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) {
                        e.currentTarget.click();
                      }
                    }}
                  >
                    <td>
                      <Button
                        className="work-title list-row"
                        onClick={(e) => {
                          e.stopPropagation();
                          platform.id === dataCenterPlatformId
                            ? router.push(`/data-center?post=${encodeURIComponent(work.id)}`)
                            : setModal({ type: 'work', work });
                        }}
                      >
                        <strong>{work.title}</strong>
                        <span className="row-arrow" aria-hidden="true">
                          →
                        </span>
                        <span>
                          {work.form}{' '}
                          <time className="mono" dateTime={work.published}>
                            {dateLabel(work.published)}
                          </time>
                        </span>
                      </Button>
                    </td>
                    {parameters.checkpoints.map((point) => (
                      <td key={point}>
                        <span title={checkpointNote(work.checkpoints[String(point)])}>
                          <Ratio
                            value={
                              work.checkpoints[String(point)]?.status === 'ready'
                                ? work.checkpoints[String(point)].ratio
                                : null
                            }
                            parameters={parameters}
                          />
                          <small className="checkpoint-note">
                            {work.checkpoints[String(point)]?.provenance === 'backfill'
                              ? '补抓'
                              : work.checkpoints[String(point)]?.provenance === 'historical'
                                ? '补录'
                                : work.checkpoints[String(point)]?.status !== 'ready'
                                  ? checkpointNote(work.checkpoints[String(point)])
                                  : ''}
                          </small>
                        </span>
                      </td>
                    ))}
                    <td className="work-state">{work.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {works.length === 0 && <Empty>暂无近期作品</Empty>}
          </Card>
          <HitRates data={workspace} config={config} today={today} />
        </div>
        <Card
          title={`粉丝 · ${platform.name}`}
          meta={<span className="eyebrow">{range} 天</span>}
          className="followers-card"
        >
          <div className="followers-total">
            <strong className="mono">
              {latest?.precision?.followers === 'display' ? '约 ' : ''}
              {number(latest?.values.followers)}
            </strong>
            <span className={`mono ${(latest?.values.net_followers ?? 0) < 0 ? 'negative' : ''}`}>
              {signed(latest?.values.net_followers)}
            </span>
          </div>
          <div className="followers-stats">
            <div>
              <span>最近新增</span>
              <strong className="mono">{number(latest?.values.new_followers)}</strong>
            </div>
            <div>
              <span>最近取关</span>
              <strong className="mono">{number(latest?.values.lost_followers)}</strong>
            </div>
            <div>
              <span>{range} 天净增</span>
              <strong className={`mono ${(periodNet ?? 0) < 0 ? 'negative' : ''}`}>{number(periodNet)}</strong>
            </div>
          </div>
          <div className="fan-section">
            <div className="section-label">
              <span>粉丝总数</span>
            </div>
            {days.length ? (
              <Chart days={days} metric="followers" label="粉丝总数" kind="line" />
            ) : (
              <Empty>暂无粉丝数据</Empty>
            )}
          </div>
          <div className="fan-section net-section">
            <div className="section-label">
              <span>每日净增</span>
            </div>
            {days.length ? (
              <Chart days={days} metric="net_followers" label="粉丝净增" kind="needles" referenceDate={displayDate} />
            ) : (
              <Empty>暂无净增数据</Empty>
            )}
          </div>
          <div className="fan-legend">
            <span>
              <i /> 净增
            </span>
            <span className="negative">
              <i /> 净减
            </span>
          </div>
          <p className="fan-note small">
            {days.length > 0 && days.length < range
              ? `所选 ${range} 天中仅有 ${days.length} 天记录，区间净增暂不计算。`
              : '按平台标注日期记录。悬停查看每日数值。'}
          </p>
        </Card>
      </div>

      {modal && (
        <Dialog title={dialogTitle} onClose={() => setModal(null)}>
          {dialogContent}
        </Dialog>
      )}
    </main>
  );
}
