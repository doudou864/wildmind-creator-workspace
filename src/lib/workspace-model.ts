import type { Content } from './content-model';
import { z } from 'zod';
export type Day = {
  date: string;
  precision?: Record<string, 'exact' | 'display' | 'unknown'>;
  values: Record<string, number | null>;
};
export type Checkpoint = {
  ratio: number | null;
  baseline: number | null;
  samples: number;
  capturedAt: string | null;
  status: 'pending' | 'missing' | 'insufficient' | 'ready';
  provenance: 'exact' | 'backfill' | 'historical';
  reason: string | null;
};
export type Work = {
  id: string;
  title: string;
  form: string;
  published: string;
  checkpoints: Record<string, Checkpoint>;
  state: string;
};
export type PlatformData = {
  status: 'pending' | 'success' | 'failed';
  lastSuccess: string | null;
  error: string | null;
  dataPending?: { through: string; note: string };
  days: Day[];
  works: Work[];
  baselines: Record<string, number | null>;
};
export type HitRateGroup = {
  group: 'fire' | 'non-fire';
  hits: number;
  completed: number;
  total: number;
};
export type HitRatePeriod = {
  platformId: string;
  month: string;
  phase: 'final' | 'estimated';
  groups: HitRateGroup[];
  conclusionAllowed: boolean;
};
export type DashboardData = {
  attention?: { id: string; platformId: string; reason: string }[];
  platforms: Record<string, PlatformData>;
  hitRates: HitRatePeriod[];
  collectionReady: boolean;
  reviewReady: boolean;
  questions: { id: string; title: string; platformId: string }[];
  questionsReady: boolean;
  plannedContents: Content[];
  plansReady: boolean;
  themes: { id: string; revision: number; title: string; count: number; signalId: string | null }[];
  themesReady: boolean;
  themeSyncReady: boolean;
  accountAlerts: {
    id: string;
    platformId: string;
    kind: 'violation' | 'restriction' | 'follower_drop';
    title: string;
    reason: string;
    capturedAt: string;
    sourceUrl: string | null;
  }[];
  accountAlertsReady: boolean;
};
export const checkpointLabels: Record<Checkpoint['status'], string> = {
  pending: '未到检查点',
  missing: '采集缺失',
  insufficient: '样本不足',
  ready: '已记录',
};
export function checkpointNote(point: Checkpoint | undefined) {
  if (!point) return '暂无检查点记录';
  return [
    checkpointLabels[point.status],
    point.provenance === 'backfill' ? '补抓' : point.provenance === 'historical' ? '历史补录' : null,
    point.reason,
  ]
    .filter(Boolean)
    .join(' · ');
}
export function findAnomalies(
  works: Work[],
  parameters: { anomalyCheckpoints: number[]; anomalyHigh: number; anomalyLow: number; baselineMinimum: number },
) {
  return works.flatMap((work) =>
    parameters.anomalyCheckpoints.flatMap((day) => {
      const point = work.checkpoints[String(day)];
      if (!point || point.status !== 'ready' || point.samples < parameters.baselineMinimum || point.ratio === null)
        return [];
      return point.ratio > parameters.anomalyHigh || point.ratio < parameters.anomalyLow
        ? [{ work, day, ratio: point.ratio }]
        : [];
    }),
  );
}

export const themeSyncSchema = z.object({ expectedRevision: z.number().int().nonnegative() }).strict();
