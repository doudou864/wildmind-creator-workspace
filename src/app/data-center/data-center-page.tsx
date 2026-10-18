'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DataCenterData, Interpretation } from '@/lib/data-center-model';
import { backfillNote, displayAnalysisValue as display } from '@/lib/data-center-model';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { Button, Card, Empty } from '@/ui/components';
import { DataCenterChart, MetricNeedle } from '@/ui/data-center-chart';
import { request } from '@/ui/use-resource';
export default function DataCenterPage({
  data,
  today,
  syncWindow,
}: {
  data: DataCenterData;
  today: string;
  syncWindow: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [day, setDay] = useState(data.checkpoints.filter((d) => d <= data.age).at(-1) ?? data.checkpoints[0]);
  const [reports, setReports] = useState(data.interpretations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = data.selected;
  const rows = data.comparisons[day] ?? [];
  const saved =
    reports.find((r) => r.fingerprint === data.fingerprints[day]) ?? reports.find((r) => r.day === day) ?? reports[0];
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
  return (
    <main className="workspace data-center">
      <WorkspaceHeader current="/data-center" date={today} syncWindow={syncWindow} />
      <h1 className="sr-only">数据中心</h1>
      <div className="modebar">
        <p>
          <span className="mode-label mono">ANALYSIS</span>抖音 · 只和较早发布的同形式作品比
        </p>
        <Button className="text-button" onClick={() => router.refresh()}>
          刷新已存数据 ↻
        </Button>
      </div>
      {!selected ? (
        <Card index="00" title="数据中心">
          <Empty>暂无可分析的抖音作品</Empty>
        </Card>
      ) : (
        <>
          <section className="card analysis-workbar">
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
                {!available.some((p) => p.id === selected.id) && <option value={selected.id}>{selected.title}</option>}
                {available.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              {!available.length && <small>没有匹配的作品</small>}
            </div>
            <div className="analysis-title">
              <strong title={selected.title}>{selected.title}</strong>
              <span className="small">
                {selected.form} ·{' '}
                <span className="mono">
                  {new Date(selected.publishedAt).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })} · D
                  {data.age}
                </span>
                （已满 {data.age} 天） {selected.fire && <span className="tag">FIRE</span>}
              </span>
            </div>
            <div className="analysis-ratio">
              <strong className={`mono ${data.ratio != null && data.ratio >= data.hitThreshold ? 'negative' : ''}`}>
                {data.ratio == null ? '—' : `${data.ratio.toFixed(1)}×`}
              </strong>
              <small>
                {data.age >= data.endDay
                  ? `D${data.endDay} 定格`
                  : `${data.ratioDay ? `D${data.ratioDay}` : '当前'} 倍数`}
                {data.ratio == null ? ' · 样本或数据不足' : ''}
              </small>
            </div>
          </section>
          <Card
            index="01"
            title="累计播放量 · 同天龄对比"
            className="analysis-curve"
            meta={
              <span className="small">
                <span className="analysis-legend-current">━ 本条</span>　┄ 历史中位数　▰ 正常范围 P25–P75
              </span>
            }
          >
            <DataCenterChart rows={data.curve} checkpoints={data.checkpoints} minimum={data.minimum} />
            <p className="small">
              缺数断线，不补零。
              {data.curve.some((r) => r.count < data.minimum) &&
                `部分天龄样本不足（最多 ${Math.max(...data.curve.map((r) => r.count))}/${data.minimum}），不足的天龄不画中位线和范围。`}
              悬停看当天样本数。
            </p>
          </Card>
          <Card
            index="02"
            title="逐项对比 · 偏低项在前"
            className="analysis-comparison"
            meta={
              <div className="segments" role="group" aria-label="检查点">
                {data.checkpoints.map((d) => (
                  <Button
                    key={d}
                    disabled={d > data.age}
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
            <div className="analysis-table-scroll">
              <table className="analysis-table">
                <thead>
                  <tr>
                    <th>指标</th>
                    <th>本条值</th>
                    <th>中位数</th>
                    <th>正常范围 / 本条位置</th>
                    <th>结论</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.name}
                        <small>
                          {row.unit} · {row.direction === 'lower' ? '越小越好' : '越大越好'}
                        </small>
                        {backfillNote(row, day) && (
                          <small className="analysis-provenance">{backfillNote(row, day)}</small>
                        )}
                      </td>
                      <td className="mono">
                        {row.approximate && row.value != null ? '约 ' : ''}
                        {display(row.value)}
                      </td>
                      <td className="mono">{display(row.median)}</td>
                      <td>
                        <MetricNeedle row={row} />
                        <small className="mono">
                          {row.p25 != null
                            ? `${display(row.p25)}–${display(row.p75)}`
                            : `样本 ${row.count}/${data.minimum}`}
                        </small>
                      </td>
                      <td>
                        {row.status === 'missing'
                          ? '没抓到'
                          : row.status === 'insufficient'
                            ? '样本不足'
                            : row.conclusion}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && <Empty>{data.age < day ? '尚未到检查点' : '没有已存的指标数据'}</Empty>}
            </div>
            <p className="small">
              互动量按每千次播放比较；浅灰带是正常范围，黑色细针是本条位置。检查点补抓照常比较并标注。
            </p>
          </Card>
          <Card
            index="03"
            title="AI 解读"
            className="analysis-interpretation"
            meta={
              <Button disabled={busy || fresh || !data.fingerprints[day]} onClick={() => void generate()}>
                {busy ? '生成中…' : fresh ? '已保存' : saved ? `用 D${day} 数据重新生成` : '生成解读'}
              </Button>
            }
          >
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
                  {saved.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </>
            ) : (
              <Empty>点击才生成，解读会自动保存。</Empty>
            )}
            {error && (
              <p role="alert" className="small">
                {error}
              </p>
            )}
          </Card>
        </>
      )}
    </main>
  );
}
