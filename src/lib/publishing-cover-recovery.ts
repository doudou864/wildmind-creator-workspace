import { z } from 'zod';

const pendingSchema = z
  .object({
    version: z.literal(1),
    assetId: z.string().min(1),
    targetBatchId: z.string().nullable(),
    title: z.string(),
    ratio: z.string().min(1),
    topicId: z.string().nullable(),
    startedAt: z.string().min(1),
  })
  .strict();
export type PendingCoverHandoff = z.infer<typeof pendingSchema>;
type LocalStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export type CoverRecovery =
  { status: 'clear' } | { status: 'pending'; pending: PendingCoverHandoff } | { status: 'unreadable'; reason: string };

export const coverRecoveryKey = (assetId: string) => `wildmind-publishing-cover-pending:${assetId}`;

export function readCoverRecovery(store: LocalStore, assetId: string): CoverRecovery {
  try {
    const raw = store.getItem(coverRecoveryKey(assetId));
    if (raw === null) return { status: 'clear' };
    const pending = pendingSchema.parse(JSON.parse(raw));
    if (pending.assetId !== assetId) throw Error('封面标记不符');
    return { status: 'pending', pending };
  } catch {
    return { status: 'unreadable', reason: '无法读取上次封面交接记录，请先核对发布任务。' };
  }
}

export function beginCoverRecovery(store: LocalStore, pending: PendingCoverHandoff) {
  const parsed = pendingSchema.parse(pending);
  if (readCoverRecovery(store, parsed.assetId).status !== 'clear')
    throw Error('这张封面有尚未核对的保存记录，请先核对发布任务。');
  const key = coverRecoveryKey(parsed.assetId);
  const raw = JSON.stringify(parsed);
  try {
    store.setItem(key, raw);
    if (store.getItem(key) !== raw) throw Error('未能确认本机记录');
  } catch {
    throw Error('无法保存本机交接记录，本次尚未发送，请检查浏览器存储后重试。');
  }
}

// Call only after a confirmed save, or an explicit user decision after checking the task list.
export function clearCoverRecovery(store: LocalStore, assetId: string) {
  const key = coverRecoveryKey(assetId);
  try {
    store.removeItem(key);
    if (store.getItem(key) !== null) throw Error('清除未确认');
  } catch {
    throw Error('未能清除本机待核对记录，请检查浏览器存储；本次不会重新发送。');
  }
}
