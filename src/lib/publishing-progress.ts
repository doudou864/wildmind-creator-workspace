import type { PublishReceipt } from './publishing-model';
import { publishingTaskNames, type PublishingTask } from './publishing-task-model';

export const publishingReceiptNames: Record<PublishReceipt['status'], string> = {
  queued: '等待执行',
  uploading: '上传中',
  ready: '上传完成 · 待你审核',
  expired: '资料已变化 · 需重新准备',
  submitting: '已点击提交 · 正在核验',
  pending_review: '已提交 · 平台审核中',
  published: '已发布',
  failed: '未完成',
  unknown: '结果待核对',
};
export function publishingProgress(platformIds: string[], receipts: PublishReceipt[], task?: PublishingTask) {
  const rows = platformIds.map((platformId) => {
    const receipt = receipts.find((r) => r.platformId === platformId);
    const active = task?.status === 'running';
    const status = receipt?.status;
    const label = status
      ? !active && ['queued', 'uploading', 'submitting'].includes(status)
        ? '已停止 · 待继续核验'
        : publishingReceiptNames[status]
      : '尚未上传';
    const next =
      status === 'published'
        ? '发布完成'
        : status === 'pending_review'
          ? '等待平台审核，无需重复提交'
          : status === 'ready'
            ? '审核页面后点击发布'
            : status === 'unknown' || status === 'submitting'
              ? '核对平台当前结果，勿重复提交'
              : active
                ? '正在处理'
                : '处理下方原因后继续';
    return { platformId, receipt, label, next };
  });
  const count = (status: PublishReceipt['status']) => rows.filter((r) => r.receipt?.status === status).length;
  const published = count('published'),
    review = count('pending_review'),
    ready = count('ready');
  const remaining = rows.length - published - review - ready;
  const summary = [
    published && `${published} 个已发布`,
    review && `${review} 个平台审核中`,
    ready && `${ready} 个待你审核`,
    remaining && `${remaining} 个未完成`,
  ]
    .filter(Boolean)
    .join(' · ');
  const submitted = published + review === rows.length && rows.length > 0;
  const headline =
    task?.status === 'running'
      ? task.operation === 'publish'
        ? '正在发布并核验结果'
        : '正在上传处理'
      : submitted
        ? review
          ? '提交已完成 · 等待平台审核'
          : '全部发布完成'
        : task?.status === 'ready'
          ? ready === rows.length && rows.length > 0
            ? '上传完成 · 等待你审核'
            : '本轮已停止 · 仍有平台未完成'
          : task && ['attention', 'interrupted'].includes(task.status)
            ? '本轮已停止 · 仍有平台未完成'
            : task
              ? publishingTaskNames[task.status]
              : '草稿 · 尚未上传';
  return { rows, summary, headline };
}
