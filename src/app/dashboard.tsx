'use client';

import Link from 'next/link';
import {
  dealActionGroups,
  dealCounts,
  dealSource,
  waitingDuration,
  type DealConfig,
  type DealData,
} from '@/lib/deal-model';
import { assessReplies, type InboxConfig } from '@/lib/inbox-model';
import { useMemo, useState, type ReactNode } from 'react';
import type { WorkspaceConfig, Platform } from '@/lib/config';
import { checkpointNote, findAnomalies, type DashboardData, type Work } from '@/lib/workspace-model';
import { request, useResource } from '@/ui/use-resource';
import { HitRates } from '@/ui/hit-rates';
import { dateLabel, number, signed, lastSuccessTimeLabel } from '@/lib/format';
import { Button, Card, Dialog, Empty, Ratio, Segmented } from '@/ui/components';
import { Chart } from '@/ui/charts';

import { WorkspaceHeader } from '@/ui/workspace-header';
type Modal = { type: 'source'; platform: Platform } | { type: 'work'; work: Work } | null;

export default function Dashboard({
  config,
  today,
  initialData,
  dealConfig,
  dealChannels,
  initialDeals,
}: {
  dealConfig: DealConfig;
  dealChannels: InboxConfig['channels'];
  initialDeals: DealData;
  config: WorkspaceConfig;
  today: string;
  initialData: DashboardData;
}) {
  const { data: workspace, error, refresh } = useResource('/api/dashboard', initialData);
  const { data: deals, error: dealError, refresh: refreshDeals } = useResource('/api/deals', initialDeals);
  const counts = dealCounts(deals.items),
    replies = assessReplies(deals.messages);
  const actions = dealActionGroups(deals.items, deals.messages, replies);
  const { platforms, metrics, parameters } = config;
  const [themeBusy, setThemeBusy] = useState<string | null>(null),
    [themeNotice, setThemeNotice] = useState('');
  const [themeReceipts, setThemeReceipts] = useState<Record<string, string>>({});
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
  if (modal?.type === 'source') {
    const source = workspace.platforms[modal.platform.id];
    dialogTitle = `${modal.platform.name} · 采集状态`;
    dialogContent = (
      <>
        <p className="dialog-intro">
          {workspace.collectionReady ? '最近一次采集状态。' : '尚未接入采集服务，暂无采集日志。'}
        </p>
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
        <p className="muted">采集服务尚未接入，当前无法执行重抓。</p>
        <Button disabled className="selected">
          立即重抓（待接入）
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
        <p className="muted">各检查点分别计算并定格；D1 只用于异常提醒，不参与走势分类。</p>
      </>
    );
  }
  return (
    <main className="workspace">
      <h1 className="sr-only">野生脑洞总控台</h1>
      <WorkspaceHeader current="/" date={displayDate} syncWindow={parameters.syncWindow} />
      <div className="modebar">
        <p>
          <span className="mode-label mono">LOCAL</span>
          {workspace.collectionReady ? '本机业务数据 · 每日更新' : '采集服务待接入 · 尚无平台数据'}
        </p>
        <Button
          className="text-button"
          onClick={() => {
            void refresh();
            void refreshDeals();
          }}
        >
          刷新数据 ↻
        </Button>
      </div>
      {(error || dealError) && (
        <p role="alert" className="topic-feedback">
          {error || dealError}
        </p>
      )}
      <section className="card health" aria-label="数据健康">
        <div className="health-heading">
          <h2 className="eyebrow">00 · SOURCE</h2>
          <span className="eyebrow">最近一次成功更新 · 点击查看日志</span>
        </div>
        <div className="health-grid">
          {healthPlatforms.map((item) => {
            const source = workspace.platforms[item.id];
            const status = source?.status ?? 'pending';
            return (
              <div className={`health-item ${status}`} key={item.id}>
                <button
                  className="source-button"
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
                </button>
                {status === 'failed' && (
                  <Button className="selected retry" onClick={() => setModal({ type: 'source', platform: item })}>
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
          <Card
            index="01"
            title="今日行动"
            meta={
              <span className="eyebrow">
                {actionsReady
                  ? failedPlatforms.length +
                    actions.length +
                    workspace.questions.length +
                    planned.length +
                    workspace.accountAlerts.length
                  : '--'}{' '}
                ITEMS
              </span>
            }
            className="actions-card"
          >
            {workspace.attention?.map((item) => (
              <div className="action-row" key={item.id}>
                <span>
                  <small>需要你处理 · {platforms.find((p) => p.id === item.platformId)?.name ?? item.platformId}</small>
                  <strong>{item.reason}</strong>
                </span>
              </div>
            ))}
            {actions.map((group, index) => {
              const source = group.message;
              const evidence = replies.get(source.id)?.observed;
              return (
                <div className="action-row deal-dashboard-action" key={group.id}>
                  <span className="letter mono">{String.fromCharCode(65 + index)}</span>
                  <span>
                    <Link href={`/inbox?message=${encodeURIComponent(source.id)}`}>
                      <small>
                        {replies.get(source.id)?.state === 'unknown' ? '商单回复状态待核对' : '商单会话待回复'} ·{' '}
                        {platforms.find((p) => p.id === source.platformId)?.name ?? source.platformId}
                      </small>
                      <strong>
                        {source.author || '发送者待核实'} · {group.deals.length} 条关联商单
                      </strong>
                    </Link>
                    <span>
                      {group.deals.map((deal) => (
                        <Link key={deal.id} className="small" href={`/deals?deal=${encodeURIComponent(deal.id)}`}>
                          {deal.brand || '品牌待核实'} →{' '}
                        </Link>
                      ))}
                    </span>
                  </span>
                  <span className="row-arrow mono">读取时已等 {evidence ? waitingDuration(evidence) : '--'}</span>
                </div>
              );
            })}
            {workspace.questions.slice(0, parameters.dashboardPreviewLimit).map((item) => (
              <Link
                key={`question-${item.id}`}
                className="action-row"
                href={`/inbox?message=${encodeURIComponent(item.id)}`}
              >
                <span>
                  <small>
                    有价值的问题待处理 · {platforms.find((p) => p.id === item.platformId)?.name ?? item.platformId}
                  </small>
                  <strong>{item.title}</strong>
                </span>
                <span>→</span>
              </Link>
            ))}
            {workspace.questions.length > parameters.dashboardPreviewLimit && (
              <Link className="small" href="/inbox">
                查看全部 {workspace.questions.length} 条问题 →
              </Link>
            )}
            {planned.map((content) => (
              <Link
                key={`planned-${content.id}`}
                className="action-row"
                href={`/publishing?content=${encodeURIComponent(content.id)}&kind=${content.form === '视频' ? 'video' : 'layout'}`}
              >
                <span>
                  <small>计划今天发布 · {content.form}</small>
                  <strong>{content.title}</strong>
                </span>
                <span>→</span>
              </Link>
            ))}
            {workspace.accountAlerts.map((alert) => (
              <button
                className="action-row"
                key={`account-${alert.id}`}
                onClick={() => {
                  const p = platforms.find((p) => p.id === alert.platformId);
                  if (p) setModal({ type: 'source', platform: p });
                }}
              >
                <span>
                  <small>账号异常 · {platforms.find((p) => p.id === alert.platformId)?.name ?? alert.platformId}</small>
                  <strong>{alert.title}</strong>
                  <small>{alert.reason}</small>
                </span>
              </button>
            ))}
            {failedPlatforms.map((item, index) => (
              <button className="action-row" key={item.id} onClick={() => setModal({ type: 'source', platform: item })}>
                <span className="letter mono">{String.fromCharCode(65 + actions.length + index)}</span>
                <span>
                  <small>需手动处理</small>
                  <strong>
                    {item.name}：{workspace.platforms[item.id].error ?? '需要手动检查'}
                  </strong>
                </span>
                <span className="row-arrow" aria-hidden="true">
                  ↗
                </span>
              </button>
            ))}
            {!actions.length &&
              !failedPlatforms.length &&
              !workspace.questions.length &&
              !planned.length &&
              !workspace.accountAlerts.length && (
                <Empty>{actionsReady ? '今天没有待办' : '待办资料尚未齐备，暂不能判断今天是否有事'}</Empty>
              )}
            {!actionsReady && (
              <p className="small">
                未就绪：
                {[
                  !workspace.questionsReady ? '问题待处理' : null,
                  !workspace.plansReady ? '发布计划' : null,
                  !workspace.accountAlertsReady ? '账号异常' : null,
                  !deals.recordsReady ? '商单' : null,
                  !workspace.collectionReady ? '采集状态' : null,
                ]
                  .filter(Boolean)
                  .join('、')}
              </p>
            )}
          </Card>
          <Card
            index="05"
            title="商单"
            meta={
              <Link className="text-button eyebrow" href="/deals">
                LIST →
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
                  <span>{state.name}</span>
                </Link>
              ))}
            </div>
          </Card>
          <Card index="06" title="洞察与异常" className="insights-card">
            <p className="section-label">需求主题</p>
            {workspace.themes.length ? (
              workspace.themes.slice(0, parameters.dashboardPreviewLimit).map((theme) => (
                <div className="insight-row" key={theme.id}>
                  <Link href={`/inbox?theme=${encodeURIComponent(theme.id)}`}>
                    {theme.title}
                    <small>{theme.count} 条来源</small>
                  </Link>
                  <Button
                    disabled={!workspace.themeSyncReady || !!themeBusy || !!theme.signalId || !!themeReceipts[theme.id]}
                    onClick={() => void syncTheme(theme)}
                  >
                    {theme.signalId || themeReceipts[theme.id] ? '已送入选题' : '送进选题'}
                  </Button>
                </div>
              ))
            ) : (
              <Empty>{workspace.themesReady ? '暂无需求主题' : '需求主题待接入'}</Empty>
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
                        查看平台证据 ↗
                      </a>
                    )}
                  </span>
                </div>
              ))
            ) : (
              <Empty>{workspace.accountAlertsReady ? '暂无账号异常' : '账号异常信息待接入'}</Empty>
            )}
            <p className="section-label anomaly-heading">作品异常 · {platform.name}</p>
            {anomalies.length ? (
              anomalies.map(({ work, day, ratio }) => (
                <button
                  key={`${work.id}-${day}`}
                  className="insight-row"
                  onClick={() => setModal({ type: 'work', work })}
                >
                  <span className="tag">{ratio > parameters.anomalyHigh ? 'HOT' : 'DROP'}</span>
                  <span>
                    {work.title}
                    <small>
                      D{day} 达基线 {number(ratio, 1)}× · 查看详情 →
                    </small>
                  </span>
                </button>
              ))
            ) : (
              <Empty>暂无作品异常</Empty>
            )}
            <div className="insight-footnote small">
              仅在 D1 / D3 检查点识别异常；
              <br />
              样本不足或指标缺失时不做判断。
            </div>
          </Card>
        </div>
        <div className="center-column">
          <Card
            index="02"
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
                className="text-button platform-more"
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
          <Card
            index="04"
            title="近期作品"
            meta={<span className="eyebrow ratio-caption">÷ 同龄基线 · 1 格 = {parameters.ratioPerCell}×</span>}
            className="works-card"
          >
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
                  <th>TITLE</th>
                  {parameters.checkpoints.map((point) => (
                    <th key={point}>D{point}</th>
                  ))}
                  <th>走势</th>
                </tr>
              </thead>
              <tbody>
                {works.map((work) => (
                  <tr key={work.id}>
                    <td>
                      <button className="work-title" onClick={() => setModal({ type: 'work', work })}>
                        <strong>{work.title}</strong>
                        <span>
                          {work.form}{' '}
                          <time className="mono" dateTime={work.published}>
                            {dateLabel(work.published)}
                          </time>
                        </span>
                      </button>
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
            <div className="works-footnote small">
              <span>视频与图文分别计算基线 · 不足 {parameters.baselineMinimum} 条时不算倍数</span>
              <span className="mono">{platform.code}</span>
            </div>
          </Card>
          <HitRates data={workspace} config={config} today={today} />
        </div>
        <Card
          index="03"
          title={`粉丝 · ${platform.name}`}
          meta={<span className="eyebrow">{range}D</span>}
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
              <span className="eyebrow">TOTAL</span>
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
              <span className="eyebrow">DAILY CHANGE</span>
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
      <footer className="footer">
        <span className="mono">WILDMIND / CREATOR WORKSPACE</span>
        <span>
          只和自己的历史作品比<span className="footer-divider">/</span>本机工作台
        </span>
      </footer>
      {modal && (
        <Dialog title={dialogTitle} onClose={() => setModal(null)}>
          {dialogContent}
        </Dialog>
      )}
    </main>
  );
}
