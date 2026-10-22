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
      grid: { left: 80, right: 35, top: 35, bottom: 175 },
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
        data: distribution.rows.map((r) => r.id),
        boundaryGap: true,
        axisLine: { show: !distribution.count, lineStyle: { color: theme.line } },
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          formatter: (_id: string, index: number) => {
            const row = distribution.rows[index];
            const title = workTitle(row.title);
            const shortTitle = title.length > 18 ? `${title.slice(0, 18)}…` : title;
            const value = row.value == null ? '—' : `${row.approximate ? '约 ' : ''}${display(row.value)}`;
            return `{${row.value == null ? 'missing' : 'value'}|D${day}：${value}}\n${shortTitle}`;
          },
          rich: {
            value: { color: theme.accent, fontFamily: theme.font, fontSize: 12, fontWeight: 600, lineHeight: 20 },
            missing: { color: theme.muted, fontFamily: theme.font, fontSize: 12, lineHeight: 20 },
          },
          rotate: 35,
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
        axisLine: { show: !distribution.count, lineStyle: { color: theme.line } },
        nameTextStyle: { color: theme.muted, fontFamily: theme.font },
        splitLine: { show: false },
        axisLabel: {
          color: theme.muted,
          fontFamily: theme.font,
          fontSize: 11,
          show: distribution.count > 0,
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
          showAllSymbol: true,
          symbol: 'circle',
          symbolSize: 9,
          z: 3,
          itemStyle: { color: theme.accent },
          lineStyle: { color: theme.accent, width: 2 },
          label: {
            show: true,
            position: 'top',
            color: theme.accent,
            fontFamily: theme.font,
            fontSize: 11,
            formatter: ({ dataIndex }: { dataIndex: number }) => {
              const row = distribution.rows[dataIndex];
              return row.value == null ? '' : `${row.approximate ? '约 ' : ''}${display(row.value)}`;
            },
          },
          markLine: {
            silent: true,
            z: 1,
            symbol: 'none',
            label: {
              position: 'insideEndBottom',
              color: theme.ink,
              formatter: `中位数 ${display(distribution.median)}`,
            },
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
        style={{ minWidth: Math.max(600, distribution.rows.length * 105), height: 435 }}
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
