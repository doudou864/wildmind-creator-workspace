'use client';
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { chartTheme } from './chart-theme';
import type { Comparison } from '@/core/data-center';
import { displayAnalysisValue as display } from '@/lib/data-center-model';
echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);
export function DataCenterChart({
  rows,
  checkpoints,
  minimum,
}: {
  rows: Comparison[];
  checkpoints: number[];
  minimum: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const theme = chartTheme(ref.current);
    const chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
    chart.setOption({
      animation: false,
      grid: { left: 65, right: 25, top: 22, bottom: 28 },
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: theme.card,
        borderColor: theme.line,
        textStyle: { color: theme.ink, fontFamily: theme.font, fontSize: 12 },
        formatter: (params: { dataIndex: number }[]) => {
          const i = params[0]?.dataIndex ?? 0,
            r = rows[i];
          return `D${i + 1}<br/>本条：${r.approximate ? '约 ' : ''}${display(r.value)}<br/>中位数：${display(r.median)}<br/>正常范围：${display(r.p25)}–${display(r.p75)}<br/>参与作品：${r.count}${r.count < minimum ? `<br/>样本不足（${r.count}/${minimum}）` : ''}`;
        },
      },
      xAxis: {
        type: 'category',
        data: rows.map((_, i) => `D${i + 1}`),
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: theme.muted, fontFamily: theme.font, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        splitLine: { show: false },
        axisLabel: { color: theme.muted, fontFamily: theme.font, fontSize: 11 },
      },
      series: [
        {
          name: '下界',
          type: 'line',
          stack: 'range',
          data: rows.map((r) => r.p25),
          symbol: 'none',
          connectNulls: false,
          lineStyle: { opacity: 0 },
          areaStyle: { opacity: 0 },
          silent: true,
        },
        {
          name: '正常范围',
          type: 'line',
          stack: 'range',
          data: rows.map((r) => (r.p25 == null || r.p75 == null ? null : r.p75 - r.p25)),
          symbol: 'none',
          connectNulls: false,
          lineStyle: { opacity: 0 },
          areaStyle: { color: theme.soft, opacity: 0.6 },
          silent: true,
        },
        {
          name: '历史中位数',
          type: 'line',
          data: rows.map((r) => r.median),
          symbol: 'none',
          connectNulls: false,
          lineStyle: { color: theme.ink, width: 1, type: 'dashed' },
        },
        {
          name: '本条作品',
          type: 'line',
          data: rows.map((r) => r.value),
          connectNulls: false,
          symbolSize: 5,
          itemStyle: { color: theme.accent },
          lineStyle: { color: theme.accent, width: 2 },
          markLine: {
            silent: true,
            symbol: 'none',
            label: { color: theme.muted, fontSize: 10, formatter: '{b}' },
            lineStyle: { color: theme.line, width: 1, type: 'solid' },
            data: checkpoints.map((d) => ({ name: `D${d}`, xAxis: `D${d}` })),
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
  }, [rows, checkpoints, minimum]);
  return (
    <div
      className="data-center-chart"
      ref={ref}
      role="img"
      aria-label="发布后逐日累计播放量；缺数断线，悬停查看同天龄中位数、正常范围和样本数"
    />
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
