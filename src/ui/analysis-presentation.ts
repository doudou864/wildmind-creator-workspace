import type { Comparison } from '../core/data-center';
import type { DataCenterConfig } from '../lib/data-center-config';
import type { AnalysisRead } from './analysis-read';
import { displayAnalysisValue } from '../lib/data-center-model';
export function analysisRows(rows: Comparison[], settings: DataCenterConfig['presentation']) {
  // Same configured event: prefer actual count plus its existing per-view value. Never discard a rate when count is missing.
  const hidden = new Set(
    rows
      .filter((r) => r.value != null && settings.equivalentRates[r.name])
      .map((r) => settings.equivalentRates[r.name]),
  );
  return rows.filter((r) => !hidden.has(r.name));
}
export function analysisValue(row: Comparison, readings: AnalysisRead) {
  const raw = row.capturedAt ? readings[row.capturedAt]?.[row.id] : undefined;
  if (row.unit === '次/千播放') {
    if (raw?.value == null) return `每千播放 ${displayAnalysisValue(row.value)}`;
    return `${raw.precision === 'display' ? '约 ' : ''}${displayAnalysisValue(raw.value)}${raw.unit ?? ''} · 每千播放 ${displayAnalysisValue(row.value)}`;
  }
  return `${row.approximate && row.value != null ? '约 ' : ''}${displayAnalysisValue(row.value)}${row.value == null ? '' : row.unit}`;
}
