'use client';
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { chartTheme } from './chart-theme';
import { workTitle } from './data-freshness';
import type { Comparison, PlaybackDistribution } from '@/core/data-center';
import { displayAnalysisValue as display } from '@/lib/data-center-model';
echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);
export function DataCenterChart({ distribution, day }: { distribution: PlaybackDistribution; day: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const theme = chartTheme(ref.current);
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    const escape = (text: string) =>
      text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
    chart.setOption({
      animation: false,
      grid: { left: 80, right: 35, top: 35, bottom: 150 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: theme.card,
        borderColor: theme.line,
        textStyle: { color: theme.ink, fontFamily: theme.font, fontSize: 12 },
        formatter: (params: { dataIndex: number }[]) => {
          const row = distribution.rows[params[0]?.dataIndex ?? 0];
          return `${escape(row.title)}<br/>D${day} 播放量：${row.approximate ? '约 ' : ''}${display(row.value)}<br/>中位数：${display(distribution.median)}<br/>参与作品：${distribution.count}`;
        },
      },
      xAxis: {
        type: 'category',
        data: distribution.rows.map((r) => workTitle(r.title)),
        boundaryGap: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          rotate: 35,
          width: 170,
          overflow: 'truncate',
          color: theme.muted,
          fontFamily: theme.font,
          fontSize: 11,
        },
      },
      yAxis: {
        type: 'value',
        name: '播放量',
        min: distribution.min,
        max: distribution.max,
        nameTextStyle: { color: theme.muted, fontFamily: theme.font },
        splitLine: { show: false },
        axisLabel: {
          color: theme.muted,
          fontFamily: theme.font,
          fontSize: 11,
          formatter: (value: number) => display(value),
          showMinLabel: true,
          showMaxLabel: true,
        },
      },
      series: [
        {
          name: '作品播放量',
          type: 'line',
          data: distribution.rows.map((r) => r.value),
          connectNulls: false,
          symbolSize: 6,
          itemStyle: { color: theme.ink },
          lineStyle: { color: theme.ink, width: 1 },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { position: 'insideEndTop', color: theme.ink, formatter: `中位数 ${display(distribution.median)}` },
            lineStyle: { color: theme.ink, width: 1, type: 'dashed' },
            data: distribution.median === null ? [] : [{ yAxis: distribution.median }],
          },
        },
      ],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [distribution, day]);
  return (
    <div style={{ overflowX: 'auto' }}>
      <div
        className="data-center-chart"
        style={{ minWidth: Math.max(600, distribution.rows.length * 105), height: 410 }}
        ref={ref}
        role="img"
        aria-label={`D${day}各作品播放量与中位数虚线`}
      />
    </div>
  );
}
export function MetricNeedle({ row }: { row: Comparison }) {
  if (row.value == null || row.p25 == null || row.p75 == null) return <span className="small">—</span>;
  const lo = Math.min(0, row.value, row.p25),
    hi = Math.max(row.value, row.p75, 1);
  const pos = (v: number) => 8 + ((v - lo) / (hi - lo)) * 84;
  return (
    <div
      className="metric-needle"
      role="img"
      aria-label={`本条${display(row.value)}，正常范围${display(row.p25)}至${display(row.p75)}`}
    >
      <i style={{ left: `${pos(row.p25)}%`, width: `${Math.max(1, pos(row.p75) - pos(row.p25))}%` }} />
      <b style={{ left: `${pos(row.value)}%` }} />
    </div>
  );
}
