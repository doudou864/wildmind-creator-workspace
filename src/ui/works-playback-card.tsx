'use client';
import { useState } from 'react';
import type { WorksPlaybackData } from '@/lib/data-center-model';
import { displayAnalysisValue as display } from '@/lib/data-center-model';
import { Button, Card, Empty } from './components';
import { DataCenterChart } from './data-center-chart';
export function WorksPlaybackCard({ data }: { data: WorksPlaybackData }) {
  const [day, setDay] = useState(data.days[0]);
  const distribution = data.distributions[day];
  return (
    <Card
      title={`${data.platformName}作品播放量与中位数`}
      className="analysis-curve works-playback"
      meta={
        <div className="segments" role="group" aria-label="播放量天数">
          {data.days.map((d) => (
            <Button key={d} className={day === d ? 'selected' : ''} aria-pressed={day === d} onClick={() => setDay(d)}>
              D{d}
            </Button>
          ))}
        </div>
      }
    >
      {distribution?.count ? (
        <>
          <p className="small">
            D{day} 中位数 <span className="mono">{display(distribution.median)}</span> · {distribution.count} 条有记录
            {distribution.count < data.minimum ? ' · 样本不足，仅供参考' : ''}
            {distribution.rows.length > distribution.count
              ? ` · ${distribution.rows.length - distribution.count} 条暂无当天记录`
              : ''}
          </p>
          <DataCenterChart distribution={distribution} day={day} />
        </>
      ) : (
        <Empty>暂无 D{day} 记录；采集到对应日期的数据后显示。</Empty>
      )}
    </Card>
  );
}
