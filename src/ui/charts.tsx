'use client';

import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PictorialBarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import type { Day } from '@/lib/demo';
import { chartTheme } from './chart-theme';

echarts.use([BarChart, LineChart, PictorialBarChart, GridComponent, TooltipComponent, SVGRenderer]);

type Props = { days: Day[]; metric: string; label: string; kind: 'blocks' | 'line' | 'needles'; rows?: number; referenceDate?: string };
export function Chart({ days, metric, label, kind, rows = 12, referenceDate }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [failure, setFailure] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const theme = chartTheme(node);
    let chart: ReturnType<typeof echarts.init> | undefined;
    let observer: ResizeObserver | undefined;
    try {
      chart = echarts.init(node, undefined, { renderer: 'svg' });
      const values = days.map(day => day.values[metric] ?? null);
      const valid = values.filter((value): value is number => value !== null);
      const maximum = Math.max(...valid, 1);
      const minimum = Math.min(...valid, 0);
      const labels = days.map(day => day.date.slice(5));
      const axis = { type: 'category', data: labels, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: theme.muted, fontFamily: theme.font, fontSize: 11, interval: (index: number) => [0, Math.floor((days.length - 1) / 2), days.length - 1].includes(index) } };
      const tooltip = { trigger: 'axis', confine: true, backgroundColor: theme.card, borderColor: theme.line, textStyle: { color: theme.ink, fontFamily: theme.font, fontSize: 12 } };
      const common: EChartsCoreOption = {
        animation: false, grid: { left: 12, right: 15, top: 8, bottom: 26 }, tooltip,
        xAxis: axis,
        yAxis: { type: 'value', show: false, scale: kind === 'line', splitLine: { show: false } },
      };
      if (kind === 'needles' && referenceDate) {
        common.xAxis = { ...axis, axisLabel: { ...axis.axisLabel,
          interval: (index: number) => index === 0 || index === days.length - 1,
          formatter: (_value: string, index: number) => `-${Math.round((Date.parse(referenceDate) - Date.parse(days[index].date)) / 86400000)}D`,
        } };
      }
      if (kind === 'blocks' && minimum >= 0) {
        const step = maximum / rows;
        const background = { type: 'pictorialBar', symbol: 'rect', symbolRepeat: rows, symbolBoundingData: maximum, symbolSize: ['62%', 8], symbolMargin: 2, symbolRepeatDirection: 'start', barGap: '-100%', z: 1 };
        common.yAxis = { type: 'value', show: false, min: 0, max: maximum };
        common.series = [
          { ...background, silent: true, tooltip: { show: false }, data: values.map(value => value == null ? null : maximum), itemStyle: { color: theme.soft } },
          { ...background, name: label, symbolClip: true, z: 2, data: values.map((value, index) => ({ value: value == null ? null : Math.ceil(value / step) * step, itemStyle: { color: index === days.length - 1 ? theme.accent : theme.ink } })) },
        ];
        common.tooltip = { ...tooltip, formatter: (params: { dataIndex: number }[]) => {
          const index = params[0]?.dataIndex ?? 0;
          return `${days[index].date}<br/>${label}：${values[index]?.toLocaleString('en-US') ?? '--'}`;
        } };
      } else {
        common.series = [{ type: kind === 'line' ? 'line' : 'bar', name: label, data: values.map((value, index) => ({ value, itemStyle: { color: value !== null && value < 0 ? theme.accent : kind === 'blocks' && index === days.length - 1 ? theme.accent : theme.ink } })), barWidth: 2, symbol: 'none', lineStyle: { color: theme.ink, width: 1.5 }, connectNulls: false }];
        if (kind === 'needles') common.tooltip = { ...tooltip, formatter: (params: { dataIndex: number }[]) => {
          const index = params[0]?.dataIndex ?? 0;
          const day = days[index];
          return `${day.date}<br/>净增：${day.values.net_followers?.toLocaleString('en-US') ?? '--'}<br/>新增：${day.values.new_followers?.toLocaleString('en-US') ?? '--'}<br/>取关：${day.values.lost_followers?.toLocaleString('en-US') ?? '--'}`;
        } };
      }
      const render = () => {
        // 让方块高度随容器变化，固定最多 rows 格；数值在提示中保留原值。
        if (kind === 'blocks' && minimum >= 0) {
          const series = common.series as { symbolSize: (string | number)[] }[];
          for (const item of series) item.symbolSize = ['62%', Math.max(2, (node.clientHeight - 34) / rows - 4)];
        }
        chart?.setOption(common, { notMerge: true });
        chart?.resize();
      };
      render();
      observer = new ResizeObserver(render);
      observer.observe(node);
    } catch (error) {
      console.error('图表渲染失败', error);
      setFailure(true);
    }
    return () => { observer?.disconnect(); chart?.dispose(); };
  }, [days, metric, label, kind, rows, referenceDate]);
  return <div className={`chart chart-${kind}`}><div ref={ref} role="img" aria-label={`${label}，${days.length} 天趋势，可悬停查看准确数值`} className="chart-canvas" />{failure && <p className="empty">图表加载失败，请刷新页面</p>}</div>;
}
