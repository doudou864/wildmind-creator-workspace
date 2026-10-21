'use client';
import Link from 'next/link';
import type { AnalysisRead } from '@/ui/analysis-read';
import type { DataCenterConfig } from '@/lib/data-center-config';
import { analysisRows, analysisValue } from '@/ui/analysis-presentation';
import type { Comparison } from '@/core/data-center';
import type { DashboardRead } from '@/ui/dashboard-read';
import { freshness, workTitle } from '@/ui/data-freshness';
import { visibleRecords } from '@/ui/visible-records';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DataCenterData, Interpretation } from '@/lib/data-center-model';
import { backfillNote, displayAnalysisValue as display } from '@/lib/data-center-model';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { PageHeader, Button, Card, Empty } from '@/ui/components';
import { DataCenterChart, MetricNeedle } from '@/ui/data-center-chart';
import { request } from '@/ui/use-resource';
export default function DataCenterPage({
  data: initialData,
  embedded = false,
  metricPresentation,
  rawReadings,
  readings,
  today,
  syncWindow,
}: {
  data: DataCenterData;
  embedded?: boolean;
  metricPresentation: DataCenterConfig['presentation'];
  rawReadings: AnalysisRead;
  readings: DashboardRead['readings'];
  today: string;
  syncWindow: string;
}) {
  const data = visibleRecords(initialData);
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [playbackDay, setPlaybackDay] = useState(data.playbackDays[0]);
  const distribution = data.playback[playbackDay];
  const [day, setDay] = useState(data.checkpoints.filter((d) => d <= data.age).at(-1) ?? data.checkpoints[0]);
  const [reports, setReports] = useState(data.interpretations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = data.selected;
  const rows = data.comparisons[day] ?? [];
  const shownRows = analysisRows(rows, metricPresentation);
  const keyRows = shownRows.filter((r) => metricPresentation.keyNames.includes(r.name));
  const current = selected ? readings[selected.id] : null;
  const enough = rows.some((r) => r.count >= data.minimum);
  const conclusion =
    data.ratio == null
      ? !enough
        ? `同类历史作品不足 ${data.minimum} 条，暂时只能看绝对值`
        : '同龄数据尚不完整，暂不能判断高低'
      : `D${data.ratioDay} 播放为平时的 ${data.ratio.toFixed(1)} 倍`;

  const saved =
    reports.find((r) => r.fingerprint === data.fingerprints[day]) ?? reports.find((r) => r.day === day) ?? reports[0];
  const points = [...new Set(saved?.paragraphs ?? [])];
  const fresh = saved?.fingerprint === data.fingerprints[day];
  const available = data.posts.filter((p) => p.title.toLowerCase().includes(query.toLowerCase()));
  async function generate() {
    if (!selected || busy || !data.fingerprints[day]) return;
    setBusy(true);
    setError('');
    try {
      const report = await request<Interpretation>(
        `/api/data-center/${encodeURIComponent(selected.id)}/interpretation`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ day, fingerprint: data.fingerprints[day] }),
        },
      );
      setReports((r) => [report, ...r.filter((x) => x.id !== report.id)]);
    } catch (e) {
      setError(`生成失败，可重试。${e instanceof Error ? e.message : ''}`);
    } finally {
      setBusy(false);
    }
  }
  function metricTable(groupRows: Comparison[]) {
    return (
      <table className="analysis-table">
        <thead>
          <tr>
            <th>指标</th>
            <th>本条值</th>
            {enough && (
              <>
                <th>同龄中位数</th>
                <th>正常范围</th>
                <th>结论</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {groupRows.map((row) => (
            <tr key={row.id}>
              <td>
                {row.name}
                {backfillNote(row, day) && <small title={backfillNote(row, day)}>采样于 D{row.actualDay}</small>}
              </td>
              <td className="mono">{analysisValue(row, rawReadings)}</td>
              {enough && (
                <>
                  <td>
                    {display(row.median)}
                    {row.median == null ? '' : row.unit}
                  </td>
                  <td>
                    <MetricNeedle row={row} />
                    <small>
                      {row.p25 == null
                        ? `样本 ${row.count}/${data.minimum}`
                        : `${display(row.p25)}–${display(row.p75)}${row.unit}`}
                    </small>
                  </td>
                  <td>
                    {row.status === 'missing' ? '没抓到' : row.status === 'insufficient' ? '样本不足' : row.conclusion}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const Root = embedded ? 'section' : 'main';
  return (
    <Root className={embedded ? 'data-center embedded-analysis' : 'workspace data-center'}>
      {!embedded && <WorkspaceHeader current="/data-center" date={today} syncWindow={syncWindow} />}
      <PageHeader
        title={embedded ? '作品表现' : '数据中心'}
        summary={
          selected
            ? `发布第 ${data.age} 天 · 最新累计播放 ${current?.precision === 'display' ? '约 ' : ''}${display(current?.value ?? null)} · ${conclusion}`
            : '先采集作品数据，再查看表现'
        }
        onRefresh={embedded ? undefined : () => router.refresh()}
        action={
          <Button
            variant={embedded ? 'secondary' : 'primary'}
            disabled={!selected || busy || fresh || !data.fingerprints[day]}
            disabledReason={
              busy
                ? '正在生成解读，请稍候。'
                : fresh
                  ? '当前数据已有解读，可在下方查看。'
                  : '请选择有检查点数据的作品。'
            }
            onClick={() => void generate()}
          >
            {busy ? '生成中…' : '生成解读'}
          </Button>
        }
      />
      {!selected ? (
        <Card title="数据中心">
          <Empty>暂无可分析的抖音作品</Empty>
        </Card>
      ) : (
        <>
          <section className="card analysis-summary">
            <h2>{workTitle(selected.title)}</h2>
            <p className="accent">数据{freshness(current?.capturedAt, today)}</p>
            {!embedded && (
              <>
                <div className="analysis-picker">
                  <input
                    aria-label="搜索作品标题"
                    placeholder="搜标题"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <select
                    aria-label="选择作品"
                    value={selected.id}
                    onChange={(e) => router.push(`/data-center?post=${encodeURIComponent(e.target.value)}`)}
                  >
                    {!available.some((p) => p.id === selected.id) && (
                      <option value={selected.id}>{workTitle(selected.title)}</option>
                    )}
                    {available.map((p) => (
                      <option value={p.id} key={p.id}>
                        {workTitle(p.title)}
                      </option>
                    ))}
                  </select>
                </div>
                <details className="analysis-quick">
                  <summary>快速切换最近 {Math.min(10, data.posts.length)} 条作品 →</summary>
                  {data.posts.slice(0, 10).map((p) => (
                    <Link
                      className="list-row"
                      aria-current={p.id === selected.id ? 'page' : undefined}
                      key={p.id}
                      href={`/data-center?post=${encodeURIComponent(p.id)}`}
                    >
                      {workTitle(p.title)} →
                    </Link>
                  ))}
                </details>
              </>
            )}
          </section>
          <Card
            title={enough ? '同龄数据对比' : '本条数据'}
            className="analysis-comparison"
            meta={
              <div className="segments" role="group" aria-label="检查点">
                {data.checkpoints.map((d) => (
                  <Button
                    key={d}
                    disabled={d > data.age}
                    disabledReason={`作品尚未满 ${d} 天。`}
                    className={day === d ? 'selected' : ''}
                    aria-pressed={day === d}
                    onClick={() => setDay(d)}
                  >
                    D{d}
                  </Button>
                ))}
              </div>
            }
          >
            {!enough && <p>同类作品够 {data.minimum} 条后显示对比</p>}
            <div className="analysis-key-metrics">
              {metricPresentation.keyNames.map((name) => {
                const row = keyRows.find((r) => r.name === name);
                return (
                  row && (
                    <div key={name}>
                      <span>{name}</span>
                      <strong>{analysisValue(row, rawReadings)}</strong>
                    </div>
                  )
                );
              })}
            </div>
            <div className="analysis-table-scroll">
              {enough && metricTable(keyRows)}
              {Object.entries(metricPresentation.groups).map(([group, names]) => {
                const members = shownRows.filter(
                  (r) => names.includes(r.name) && !metricPresentation.keyNames.includes(r.name),
                );
                return (
                  members.length > 0 && (
                    <details className="analysis-metric-group" key={group}>
                      <summary>{group}</summary>
                      {metricTable(members)}
                    </details>
                  )
                );
              })}
              {(() => {
                const remaining = shownRows.filter(
                  (r) =>
                    !metricPresentation.keyNames.includes(r.name) &&
                    !Object.values(metricPresentation.groups).some((names) => names.includes(r.name)),
                );
                return (
                  remaining.length > 0 && (
                    <details className="analysis-metric-group">
                      <summary>其他已采集指标</summary>
                      {metricTable(remaining)}
                    </details>
                  )
                );
              })()}
              {!rows.length && <Empty>{data.age < day ? '尚未到检查点' : '没有已存的指标数据'}</Empty>}
            </div>
          </Card>
          <Card title="AI 解读" className="analysis-interpretation">
            {saved ? (
              <>
                <p className="small">
                  基于 D{saved.day} 数据，生成于{' '}
                  <span className="mono">
                    {new Date(saved.createdAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                  </span>
                  {!fresh ? ' · 当前数据已变化，以上为上次保存的解读' : ''}
                </p>
                <div className="analysis-paragraphs">
                  {points.slice(0, 3).map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
                {points.length > 3 && (
                  <details>
                    <summary>展开完整解读 →</summary>
                    {points.slice(3).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </details>
                )}
              </>
            ) : (
              <Empty>尚无解读，可点击上方“生成解读”。</Empty>
            )}
            {error && (
              <p role="alert" className="small">
                {error}
              </p>
            )}
          </Card>
          <Card
            title="作品播放量与中位数"
            className="analysis-curve"
            meta={
              <div className="segments" role="group" aria-label="播放量天数">
                {data.playbackDays.map((d) => (
                  <Button
                    key={d}
                    className={playbackDay === d ? 'selected' : ''}
                    aria-pressed={playbackDay === d}
                    onClick={() => setPlaybackDay(d)}
                  >
                    D{d}
                  </Button>
                ))}
              </div>
            }
          >
            {distribution?.count ? (
              <>
                <p className="small">
                  {selected.form} · D{playbackDay} 中位数 <span className="mono">{display(distribution.median)}</span> ·{' '}
                  {distribution.count} 条有记录
                  {distribution.count < data.minimum ? ' · 样本不足，仅供参考' : ''}
                  {distribution.rows.length > distribution.count
                    ? ` · ${distribution.rows.length - distribution.count} 条暂无当天记录`
                    : ''}
                </p>
                <DataCenterChart distribution={distribution} day={playbackDay} />
              </>
            ) : (
              <Empty>暂无 D{playbackDay} 记录；采集到对应日期的数据后显示。</Empty>
            )}
          </Card>
        </>
      )}
    </Root>
  );
}
