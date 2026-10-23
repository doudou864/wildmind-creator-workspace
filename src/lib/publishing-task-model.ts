import { z } from 'zod';
export const publishingTaskSchema = z.object({
  batchId: z.string(),
  token: z.string(),
  status: z.enum(['running', 'pausing', 'paused', 'deleting', 'deleted', 'cleanup_failed', 'interrupted']),
  checkpoint: z.string(),
  reason: z.string().nullable(),
  process: z.object({ pid: z.number().int().positive(), command: z.string(), startedAt: z.string() }).nullable(),
  browser: z.object({ spaceId: z.number().int().positive(), name: z.string() }).nullable(),
  updatedAt: z.string(),
});
export type PublishingTask = z.infer<typeof publishingTaskSchema>;
export const publishingTaskActionSchema = z
  .object({
    action: z.enum(['pause', 'resume', 'delete']),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type PublishingTaskAction = z.infer<typeof publishingTaskActionSchema>;
export const publishingTaskNames: Record<PublishingTask['status'], string> = {
  running: '上传处理中',
  pausing: '正在暂停',
  paused: '已暂停',
  deleting: '正在清理',
  deleted: '已删除',
  cleanup_failed: '清理未完成',
  interrupted: '任务已中断',
};
