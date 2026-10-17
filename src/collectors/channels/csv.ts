import { z } from 'zod';
import { parseCsv } from '../csv.ts';
export function exportDate(raw: string) {
  return z.iso.date().parse(raw.replaceAll('/', '-'));
}
export function channelAccountRows(source: string) {
  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/);
  const header = lines.findIndex((line) => line.startsWith('"时间","净增关注","新增关注","取消关注","关注者总数"'));
  if (header < 0) throw new Error('视频号关注者导出表头变化');
  return parseCsv(lines.slice(header).join('\n'));
}
