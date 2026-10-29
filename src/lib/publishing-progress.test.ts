import { expect, test } from 'vitest';
import { publishingProgress } from './publishing-progress';
import type { PublishReceipt } from './publishing-model';
import type { PublishingTask } from './publishing-task-model';
const receipt = (platformId: string, status: PublishReceipt['status']) => ({ platformId, status }) as PublishReceipt;
const task = (status: PublishingTask['status']) => ({ status, operation: 'publish' }) as PublishingTask;
test('混合结果不能叫完成，用户直接看到各平台做到了哪一步', () => {
  const result = publishingProgress(
    ['a', 'b', 'c', 'd'],
    [receipt('a', 'published'), receipt('b', 'pending_review'), receipt('c', 'unknown'), receipt('d', 'ready')],
    task('attention'),
  );
  expect(result.summary).toBe('1 个已发布 · 1 个平台审核中 · 1 个待你审核 · 1 个未完成');
  expect(result.headline).toContain('本轮已停止');
  expect(result.rows[2].next).toContain('勿重复提交');
});
test('平台审核中仅表示提交完成，不能冒充全部发布', () => {
  const result = publishingProgress(['a'], [receipt('a', 'pending_review')], task('completed'));
  expect(result.headline).toBe('提交已完成 · 等待平台审核');
  expect(result.summary).not.toContain('已发布');
});
test('停止的进程不能因为旧回执仍显示上传中，过期资料也不能显示待审核', () => {
  expect(publishingProgress(['a'], [receipt('a', 'uploading')], task('interrupted')).rows[0].label).toBe(
    '已停止 · 待继续核验',
  );
  expect(publishingProgress(['a'], [receipt('a', 'expired')], task('attention')).summary).toBe('1 个未完成');
});

test('旧任务仍写就绪时也不能掩盖部分平台失败', () => {
  expect(
    publishingProgress(['a', 'b'], [receipt('a', 'ready'), receipt('b', 'failed')], task('ready')).headline,
  ).toContain('仍有平台未完成');
});
