import { normalizeDataDate } from '../core/collection.ts';

/** The platform was read successfully, but it has not published the requested data yet. */
export class PlatformDataPending extends Error {
  readonly through: string;
  constructor(through: string, note: string) {
    super(note);
    this.through = normalizeDataDate(through);
  }
}

export function requireDailyDataDate(actual: string | null, expected: string) {
  if (!actual) throw new Error('单日数据日期无法识别');
  const date = normalizeDataDate(actual);
  if (date < expected) throw new PlatformDataPending(date, `平台单日数据更新至${date}，等待${expected}的数据`);
  if (date !== expected) throw new Error(`单日数据日期不符：需要${expected}，实际${date}`);
}

export async function collectWithAvailability<T>(run: () => Promise<T>): Promise<{
  result: T | null;
  dataPending?: { through: string; note: string };
}> {
  try {
    return { result: await run() };
  } catch (error) {
    if (!(error instanceof PlatformDataPending)) throw error;
    return { result: null, dataPending: { through: error.through, note: error.message } };
  }
}
