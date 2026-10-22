import type { AnalysisPost, Comparison, PlaybackDistribution } from '../core/data-center';
export type InterpretationInput = { day: number; minimum: number; rows: Comparison[] };
export type Interpretation = {
  id: string;
  postId: string;
  day: number;
  fingerprint: string;
  numbers: InterpretationInput;
  paragraphs: string[];
  createdAt: string;
};
export type WorksPlaybackData = {
  platformName: string;
  days: number[];
  minimum: number;
  distributions: Record<string, PlaybackDistribution>;
};
export type DataCenterData = {
  posts: AnalysisPost[];
  selected: AnalysisPost | null;
  age: number;
  minimum: number;
  hitThreshold: number;
  ratio: number | null;
  ratioDay: number | null;
  endDay: number;
  checkpoints: number[];
  curve: Comparison[];
  comparisons: Record<string, Comparison[]>;
  fingerprints: Record<string, string>;
  interpretations: Interpretation[];
};
export function backfillNote(row: Comparison, day: number) {
  const own = row.actualDay != null && row.actualDay > day ? `D${day} 补抓于 D${row.actualDay}` : '';
  const peers = row.peerBackfills.length
    ? `历史样本补抓：${[...new Set(row.peerBackfills.map((p) => `D${day} 补抓于 D${p.actualDay}`))].join('、')}`
    : '';
  return [own, peers].filter(Boolean).join('；');
}
export function displayAnalysisValue(value: number | null) {
  return value == null ? '—' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
