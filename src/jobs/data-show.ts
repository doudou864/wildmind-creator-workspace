import type { WorkspaceDatabase } from '../db/database.ts';
import type { WorkspaceConfig } from '../lib/config.ts';
import { shanghaiDate } from '../browser/policy.ts';
import { exactGrowth } from '../core/collection.ts';
export function showData(database: WorkspaceDatabase, config: WorkspaceConfig, platform?: string, now = new Date()) {
  if (platform && !config.platforms.some((p) => p.id === platform)) throw new Error(`未知平台：${platform}`);
  const since = shanghaiDate(new Date(now.getTime() - 6 * 86400000));
  const lines: string[] = [];
  const metricName = (id: string) => config.metrics.find((m) => m.id === id)?.name ?? id;
  const value = (row: { value: number | null; precision: string; raw_value: string | null }) =>
    `${row.raw_value ?? row.value ?? '未知'}${row.precision === 'display' ? '（约数/显示精度）' : row.precision === 'unknown' ? '（精度未记录）' : ''}`;
  const filter = platform ?? null;
  const works = database.sqlite
    .prepare('SELECT * FROM posts WHERE (? IS NULL OR platform_id=?) ORDER BY published_at DESC')
    .all(filter, filter) as { id: string; title: string; platform_id: string; published_at: string }[];
  lines.push('作品最近一次主要指标（各指标可能来自不同采集时点）');
  for (const post of works) {
    lines.push(`\n${post.platform_id} | ${post.title} | 发布 ${post.published_at}`);
    const rows = database.sqlite
      .prepare(
        `SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY metric_id ORDER BY captured_at DESC) n FROM post_snapshots WHERE post_id=?) WHERE n=1`,
      )
      .all(post.id) as {
      metric_id: string;
      value: number | null;
      precision: string;
      raw_value: string | null;
      day_after_publish: number;
      backfill_kind: string;
      captured_at: string;
    }[];
    for (const row of rows.filter((r) =>
      config.metrics.some(
        (m) => m.id === r.metric_id && m.bindings.some((b) => b.platformId === post.platform_id && b.level === 'core'),
      ),
    ))
      lines.push(
        `  ${metricName(row.metric_id)}：${value(row)} | 发布后第${row.day_after_publish}天 | 补数据：${row.backfill_kind === 'none' ? '否' : row.backfill_kind} | ${row.captured_at}`,
      );
  }
  lines.push('\n最近7天账号日数据');
  const daily = database.sqlite
    .prepare(
      'SELECT * FROM account_daily WHERE data_date>=? AND (? IS NULL OR platform_id=?) ORDER BY data_date DESC,platform_id,metric_id',
    )
    .all(since, filter, filter) as {
    platform_id: string;
    data_date: string;
    metric_id: string;
    value: number | null;
    precision: string;
    raw_value: string | null;
    backfilled: number;
  }[];
  for (const row of daily)
    lines.push(
      `${row.data_date} ${row.platform_id} ${metricName(row.metric_id)}：${value(row)} | 补数据：${row.backfilled ? '是' : '否'}`,
    );
  for (const id of new Set(daily.map((r) => r.platform_id))) {
    const net = daily.filter((r) => r.platform_id === id && r.metric_id === 'net_followers');
    lines.push(`${id} 已有日数据精确净增合计：${exactGrowth(net) ?? '不足（缺少精确净增）'}；不以约数粉丝总量相减`);
  }
  lines.push('\n最近7天运行记录');
  const runs = database.sqlite
    .prepare('SELECT * FROM crawl_logs WHERE started_at>=? AND (? IS NULL OR platform_id=?) ORDER BY started_at DESC')
    .all(new Date(since + 'T00:00:00+08:00').toISOString(), filter, filter) as {
    started_at: string;
    finished_at: string | null;
    platform_id: string;
    status: string;
    reason: string | null;
    telemetry: string | null;
  }[];
  const yes = (v: boolean | undefined) => (v === undefined ? '未记录' : v ? '是' : '否');
  for (const run of runs) {
    const t = run.telemetry ? JSON.parse(run.telemetry) : null;
    lines.push(
      `${new Date(run.started_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} ${run.platform_id} | 延迟：${yes(t?.delayed)} | 复用同日截图：${yes(t?.reusedScreenshots)} | 打开页面：${t?.pages ?? '未记录'} | AI识别：${t?.aiReads ?? '未分项记录'} | AI总调用：${t?.aiCalls ?? '未记录'} | 耗时：${run.finished_at ? Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000) + '秒' : '运行中'} | ${run.status}：${run.reason ?? (run.status === 'success' ? '采集成功' : '进行中')} | 需要处理：${yes(t?.attention)}`,
    );
  }
  return lines.join('\n');
}
