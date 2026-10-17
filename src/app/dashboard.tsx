'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type { WorkspaceConfig, Platform } from '@/lib/config';
import { DEMO_DATE, demo, type Work } from '@/lib/demo';
import { dateLabel, number, signed } from '@/lib/format';
import { Button, Card, Dialog, Empty, Ratio, Segmented } from '@/ui/components';
import { Chart } from '@/ui/charts';

const laterPages = ['选题中心', '生图中心', '排版中心', '发布中心', '互动收件箱', '商单列表'];
type Modal = { type: 'source'; platform: Platform } | { type: 'work'; work: Work } | { type: 'deals' } | null;

export default function Dashboard({ config, today }: { config: WorkspaceConfig; today: string }) {
  const { platforms, metrics, parameters } = config;
  const [platformId, setPlatformId] = useState(platforms[0].id);
  const [range, setRange] = useState(parameters.defaultRange);
  const [metricId, setMetricId] = useState(platforms[0].metrics[0]);
  const [demoMode, setDemoMode] = useState(true);
  const [form, setForm] = useState('全部');
  const [modal, setModal] = useState<Modal>(null);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const platform = platforms.find(item => item.id === platformId)!;
  const metric = metrics.find(item => item.id === metricId)!;
  const data = demoMode ? demo[platformId] : undefined;
  const displayDate = demoMode ? DEMO_DATE : today;
  const weekday = new Date(`${displayDate}T12:00:00+08:00`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Shanghai' }).toUpperCase();
  const days = useMemo(() => {
    if (!data) return [];
    const start = new Date(`${displayDate}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - range);
    return data.days.filter(day => day.date >= start.toISOString().slice(0, 10) && day.date < displayDate);
  }, [data, range, displayDate]);
  const latest = data?.days.at(-1);
  const previous = data?.days.at(-2);
  const currentValue = latest?.values[metricId];
  const previousValue = previous?.values[metricId];
  const difference = currentValue != null && previousValue != null && previousValue !== 0 ? (currentValue - previousValue) / Math.abs(previousValue) * 100 : null;
  const netValues = days.map(day => day.values.net_followers);
  const periodNet = days.length === range && netValues.every(value => value != null) ? netValues.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
  const visiblePlatforms = showAllPlatforms ? platforms : platforms.filter(item => item.active || item.id === platformId);
  const healthPlatforms = platforms.filter(item => item.active);
  const failedPlatforms = demoMode ? healthPlatforms.filter(item => demo[item.id]?.status === 'failed') : [];
  const recentStart = new Date(`${displayDate}T00:00:00Z`);
  recentStart.setUTCDate(recentStart.getUTCDate() - parameters.recentWindow);
  const works = data?.works.filter(work => work.published >= recentStart.toISOString().slice(0, 10) && work.published <= displayDate && (form === '全部' || work.form === form)) ?? [];
  const anomalies = data?.works.filter(work => { const value = work.ratios['3']; return value != null && (value > parameters.anomalyHigh || value < parameters.anomalyLow); }) ?? [];
  const changePlatform = (id: string) => {
    const next = platforms.find(item => item.id === id)!;
    setPlatformId(id); setMetricId(next.metrics[0]); setForm('全部');
  };
  const lastSuccessLabel = (id: string) => {
    const source = demoMode ? demo[id] : undefined;
    if (!source) return '--';
    const timestamp = source.lastSuccess;
    const differenceDays = Math.round((Date.parse(`${displayDate}T00:00:00Z`) - Date.parse(`${timestamp.slice(0, 10)}T00:00:00Z`)) / 86400000);
    return `${differenceDays ? `-${differenceDays}D ` : ''}${timestamp.slice(11, 16)}`;
  };
  let dialogContent: ReactNode = null;
  let dialogTitle = '';
  if (modal?.type === 'source') {
    const source = demoMode ? demo[modal.platform.id] : undefined;
    dialogTitle = `${modal.platform.name} · 采集状态`;
    dialogContent = <><p className="dialog-intro">{demoMode ? '以下为演示日志，用于检查数据健康条的展示。' : '尚未接入采集服务，暂无真实日志。'}</p><dl className="detail-list"><div><dt>采集方式</dt><dd>{modal.platform.collection}</dd></div><div><dt>最近成功</dt><dd className="mono">{source?.lastSuccess.replace('T', ' ').replace('+08:00', '') ?? '--'}</dd></div><div><dt>当前状态</dt><dd>{source ? source.status === 'failed' ? '采集失败' : '采集成功（演示）' : '尚未抓取'}</dd></div><div><dt>失败原因</dt><dd>{source?.error ?? '--'}</dd></div><div><dt>计划时段</dt><dd className="mono">{parameters.syncWindow}</dd></div><div><dt>计划重试</dt><dd className="mono">{parameters.retryTimes.join(' / ')}</dd></div></dl><p className="muted">采集服务尚未接入，当前无法执行重抓。</p><Button disabled className="selected">立即重抓（待接入）</Button></>;
  } else if (modal?.type === 'work') {
    const work = modal.work;
    dialogTitle = work.title;
    dialogContent = <><p className="dialog-intro">{platform.name} · {work.form} · {work.published} 发布 · 演示数据</p><dl className="detail-list"><div><dt>当前走势</dt><dd>{work.state}</dd></div><div><dt>复盘主指标</dt><dd>{platform.reviewMetric}</dd></div><div><dt>同形式样本</dt><dd className="mono">{work.samples}</dd></div><div><dt>D21 同龄基线</dt><dd className="mono">{number(work.baseline)}</dd></div>{parameters.checkpoints.map(point => <div key={point}><dt className="mono">D{point}</dt><dd><Ratio value={work.ratios[String(point)] ?? null} parameters={parameters} /></dd></div>)}</dl><p className="muted">{work.reason ?? '倍数在检查点定格；尚未到达的检查点显示 --。仅与本平台、同内容形式的历史作品对比。'}</p></>;
  } else if (modal?.type === 'deals') {
    dialogTitle = '商单概况';
    dialogContent = <><Empty>暂无商单线索</Empty><p className="muted">互动收件箱尚未接入。接入后按待处理、跟进中、已完成三种状态汇总。</p></>;
  }
  return <main className="workspace"><h1 className="sr-only">野生脑洞总控台</h1>
    <header className="topbar"><a className="brand" href="/" aria-label="WILDMIND 野生脑洞工作台首页"><strong>WILDMIND</strong><span>野生脑洞 · 工作台</span></a><nav aria-label="工作台板块"><Button className="nav-key current" aria-current="page">总控台</Button>{laterPages.map(name => <Button key={name} className="nav-key" disabled title="后续开发，本次仅实现总控台">{name}</Button>)}</nav><div className="clock mono"><time dateTime={displayDate}>{displayDate} {weekday}</time><span>SYNC {parameters.syncWindow}</span></div></header>
    <div className="modebar"><p><span className="mode-label mono">{demoMode ? 'DEMO' : 'LOCAL'}</span>{demoMode ? '演示数据 · 仅用于界面预览，未连接平台' : '暂无真实数据 · 等待接入数据底座'}</p><Button className="text-button" onClick={() => { setDemoMode(!demoMode); setModal(null); }}>{demoMode ? '查看无数据状态' : '返回演示数据'} <span aria-hidden="true">↗</span></Button></div>
    <section className="card health" aria-label="数据健康"><div className="health-heading"><h2 className="eyebrow">00 · SOURCE</h2><span className="eyebrow">最近一次成功更新 · 点击查看日志</span></div><div className="health-grid">{healthPlatforms.map(item => {
      const source = demoMode ? demo[item.id] : undefined;
      const status = source?.status ?? 'pending';
      return <div className={`health-item ${status}`} key={item.id}><button className="source-button" onClick={() => setModal({ type: 'source', platform: item })} aria-label={`${item.name}采集状态：${status === 'failed' ? '失败' : status === 'success' ? '成功（演示）' : '尚未抓取'}`}><span className="status-dot" aria-hidden="true">{status === 'success' ? '◉' : status === 'failed' ? '●' : '○'}</span><span className="source-name"><b className="mono">{item.code}</b><span>{item.name}</span></span><time className="mono" dateTime={source?.lastSuccess}>{lastSuccessLabel(item.id)}</time></button>{status === 'failed' && <Button className="selected retry" onClick={() => setModal({ type: 'source', platform: item })}>重抓</Button>}</div>;
    })}</div>{failedPlatforms.length > 0 && <div className="health-error"><span className="error-label">采集失败</span>{failedPlatforms.map(item => `${item.name}：${demo[item.id].error}`).join('；')}</div>}</section>
    <div className="dashboard-grid">
      <div className="left-column">
        <Card index="01" title="今日行动" meta={<span className="eyebrow">{failedPlatforms.length} ITEMS</span>} className="actions-card">{failedPlatforms.length ? failedPlatforms.map((item, index) => <button className="action-row" key={item.id} onClick={() => setModal({ type: 'source', platform: item })}><span className="letter mono">{String.fromCharCode(65 + index)}</span><span><small>需手动处理</small><strong>{item.name}登录失效，请重新扫码</strong></span><span className="row-arrow" aria-hidden="true">↗</span></button>) : <Empty>今天没有待办</Empty>}</Card>
        <Card index="05" title="商单" meta={<Button className="text-button eyebrow" onClick={() => setModal({ type: 'deals' })}>LIST →</Button>}><div className="deal-counts">{['待处理', '跟进中', '已完成'].map(state => <button key={state} onClick={() => setModal({ type: 'deals' })}><strong className="mono">00</strong><span>{state}</span></button>)}</div></Card>
        <Card index="06" title="洞察与异常" className="insights-card"><p className="section-label">需求主题</p><Empty>暂无需求主题</Empty><p className="section-label anomaly-heading">作品异常 · {platform.name}</p>{anomalies.length ? anomalies.map(work => <button key={work.id} className="insight-row" onClick={() => setModal({ type: 'work', work })}><span className="tag">{(work.ratios['3'] ?? 0) > parameters.anomalyHigh ? 'HOT' : 'DROP'}</span><span>{work.title}<small>D3 达基线 {number(work.ratios['3'], 1)}× · 查看详情 →</small></span></button>) : <Empty>暂无作品异常</Empty>}<div className="insight-footnote small">仅在 D1 / D3 检查点识别异常；<br/>样本不足或指标缺失时不做判断。</div></Card>
      </div>
      <div className="center-column">
        <Card index="02" title="平台趋势" meta={<Segmented label="时间范围" value={range} onChange={setRange} options={parameters.timeRanges.map(value => ({ value, label: `${value}D` }))} />} className="trend-card">
          <div className="trend-summary"><div className="hero-stat"><strong className={`mono ${metricId === 'net_followers' && (currentValue ?? 0) < 0 ? 'negative' : ''}`}>{number(currentValue)}</strong><span>{latest ? `${dateLabel(latest.date)} · ` : ''}{metric.name} · {platform.name}</span></div><div className="baseline-stat"><span>D21 基线 · {platform.forms[0]}</span><strong className="mono">{number(data?.baselines[platform.forms[0]])}</strong>{platform.forms.length > 1 && <small>图文 {number(data?.baselines['图文'])}</small>}</div><div className="compare-stat"><span>较前一日</span><strong className="mono">{difference == null ? '--' : `${difference > 0 ? '+' : ''}${number(difference, 1)}%`}</strong><small>{metric.unit} / 日</small></div></div>
          <div className="platform-controls"><Segmented label="平台" value={platformId} onChange={changePlatform} options={visiblePlatforms.map(item => ({ value: item.id, label: item.name }))} /><Button aria-expanded={showAllPlatforms} className="text-button platform-more" onClick={() => setShowAllPlatforms(!showAllPlatforms)}>{showAllPlatforms ? '收起' : '更多平台 +'} </Button></div>
          <div className="metric-controls"><label htmlFor="trend-metric">趋势指标</label><select id="trend-metric" value={metricId} onChange={event => setMetricId(event.target.value)}>{platform.metrics.map(id => <option key={id} value={id}>{metrics.find(item => item.id === id)!.name}</option>)}</select><span className="small">{metric.level === 'core' ? '核心指标' : '次核心指标'} · 账号日数据</span></div>
          {days.length ? <Chart days={days} metric={metricId} label={metric.name} kind="blocks" rows={parameters.chartRows} /> : <div className="chart-empty"><Empty>{platform.active ? '暂无趋势数据' : '该平台尚未开始运营'}</Empty></div>}
        </Card>
        <Card index="04" title="近期作品" meta={<span className="eyebrow ratio-caption">÷ 同龄基线 · 1 格 = {parameters.ratioPerCell}×</span>} className="works-card"><div className="works-toolbar"><span className="small">近 {parameters.recentWindow} 天 · {platform.name} · {works.length} 条</span><Segmented label="内容形式" value={form} onChange={setForm} options={['全部', ...platform.forms].map(value => ({ value, label: value }))} /></div><table className="works-table"><thead><tr><th>TITLE</th>{parameters.checkpoints.map(point => <th key={point}>D{point}</th>)}<th>走势</th></tr></thead><tbody>{works.map(work => <tr key={work.id}><td><button className="work-title" onClick={() => setModal({ type: 'work', work })}><strong>{work.title}</strong><span>{work.form} <time className="mono" dateTime={work.published}>{dateLabel(work.published)}</time></span></button></td>{parameters.checkpoints.map(point => <td key={point}><Ratio value={work.ratios[String(point)] ?? null} parameters={parameters} /></td>)}<td className="work-state">{work.state}</td></tr>)}</tbody></table>{works.length === 0 && <Empty>暂无近期作品</Empty>}<div className="works-footnote small"><span>视频与图文分别计算基线 · 不足 {parameters.baselineMinimum} 条时不算倍数</span><span className="mono">{demoMode ? 'DEMO / ' : ''}{platform.code}</span></div></Card>
      </div>
      <Card index="03" title={`粉丝 · ${platform.name}`} meta={<span className="eyebrow">{range}D</span>} className="followers-card"><div className="followers-total"><strong className="mono">{number(latest?.values.followers)}</strong><span className={`mono ${(latest?.values.net_followers ?? 0) < 0 ? 'negative' : ''}`}>{signed(latest?.values.net_followers)}</span></div><div className="followers-stats"><div><span>最近新增</span><strong className="mono">{number(latest?.values.new_followers)}</strong></div><div><span>最近取关</span><strong className="mono">{number(latest?.values.lost_followers)}</strong></div><div><span>{range} 天净增</span><strong className={`mono ${(periodNet ?? 0) < 0 ? 'negative' : ''}`}>{number(periodNet)}</strong></div></div><div className="fan-section"><div className="section-label"><span>粉丝总数</span><span className="eyebrow">TOTAL</span></div>{days.length ? <Chart days={days} metric="followers" label="粉丝总数" kind="line" /> : <Empty>暂无粉丝数据</Empty>}</div><div className="fan-section net-section"><div className="section-label"><span>每日净增</span><span className="eyebrow">DAILY CHANGE</span></div>{days.length ? <Chart days={days} metric="net_followers" label="粉丝净增" kind="needles" referenceDate={displayDate} /> : <Empty>暂无净增数据</Empty>}</div><div className="fan-legend"><span><i /> 净增</span><span className="negative"><i /> 净减</span></div><p className="fan-note small">{days.length > 0 && days.length < range ? `所选 ${range} 天中仅有 ${days.length} 天记录，区间净增暂不计算。` : '按平台标注日期记录。悬停查看每日数值。'}</p></Card>
    </div>
    <footer className="footer"><span className="mono">WILDMIND / CREATOR WORKSPACE</span><span>只和自己的历史作品比<span className="footer-divider">/</span>{demoMode ? '当前为演示数据' : '等待真实数据接入'}</span></footer>
    {modal && <Dialog title={dialogTitle} onClose={() => setModal(null)}>{dialogContent}</Dialog>}
  </main>;
}
