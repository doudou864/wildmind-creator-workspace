'use client';
import { useState } from 'react';
import type { DashboardData, HitRatePeriod } from '@/lib/workspace-model';
import type { WorkspaceConfig } from '@/lib/config';
import { Card, Segmented } from './components';
function Groups({ period, estimated }: { period: HitRatePeriod | undefined; estimated: boolean }) {
  return (
    <div className="hit-groups">
      {(['fire', 'non-fire'] as const).map((group) => {
        const value = period?.groups.find((g) => g.group === group);
        return (
          <div key={group}>
            <span className="eyebrow">{group === 'fire' ? 'FIRE' : '非 FIRE · 对照组'}</span>
            <strong className="mono">
              {value && value.completed > 0 ? `${((100 * value.hits) / value.completed).toFixed(1)}%` : '--'}
            </strong>
            <p className="small">
              {estimated ? '预估命中' : '命中'} {value?.hits ?? '--'} / {estimated ? '已完成 D7' : '已终判'}{' '}
              {value?.completed ?? '--'}
              <br />
              该月首发选题 {value?.total ?? '--'}
            </p>
          </div>
        );
      })}
    </div>
  );
}
export function HitRates({ data, config, today }: { data: DashboardData; config: WorkspaceConfig; today: string }) {
  const platforms = config.platforms.filter((p) => config.parameters.reviewPlatforms.includes(p.id));
  const [platformId, setPlatformId] = useState(platforms[0]?.id ?? '');
  const current = today.slice(0, 7);
  const previous = new Date(`${current}-01T00:00:00Z`);
  previous.setUTCMonth(previous.getUTCMonth() - 1);
  const months = [
    ...new Set([
      previous.toISOString().slice(0, 7),
      ...data.hitRates.filter((p) => p.month < current).map((p) => p.month),
    ]),
  ]
    .sort()
    .reverse();
  const [month, setMonth] = useState(months[0]);
  const final = data.hitRates.find((p) => p.platformId === platformId && p.month === month && p.phase === 'final');
  const estimated = data.hitRates.find(
    (p) => p.platformId === platformId && p.month === current && p.phase === 'estimated',
  );
  return (
    <Card index="07" title="选题命中率" className="hit-rates" meta={<span className="eyebrow">D21 / D7</span>}>
      <div className="works-toolbar">
        <Segmented
          label="命中率平台"
          value={platformId}
          onChange={setPlatformId}
          options={platforms.map((p) => ({ value: p.id, label: p.name }))}
        />
        <label>
          历史首发月{' '}
          <select aria-label="首发月份" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <section className="hit-period">
        <h3>
          {month} · 已定稿 <span className="eyebrow">D21 · 已终判</span>
        </h3>
        <Groups period={final} estimated={false} />
      </section>
      <section className="hit-period">
        <h3>
          {current} · 本月预估 <span className="eyebrow">D7 · 进行中</span>
        </h3>
        <Groups period={estimated} estimated />
      </section>
      <p className="small topic-rule">
        {!data.reviewReady
          ? '复盘服务待接入，暂无核算结果。'
          : !final && !estimated
            ? '所选月份暂无核算记录。'
            : !final?.conclusionAllowed || !estimated?.conclusionAllowed
              ? `样本未达到结论要求的月份只记录结果，累计 ${config.parameters.conclusionMinimum} 个选题前不判断推荐效果。`
              : '样本已达到结论门槛。'}{' '}
        按选题首发计数，排除自动建立及历史补录；抖音视频与图文合并核算，公众号单独核算。
      </p>
    </Card>
  );
}
