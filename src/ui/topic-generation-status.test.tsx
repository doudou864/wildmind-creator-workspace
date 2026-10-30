import { test, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('./components', async () => {
  const { createElement } = await import('react');
  return {
    Card: ({ children }: { children: import('react').ReactNode }) => createElement('section', {}, children),
    Button: ({ children }: { children: import('react').ReactNode }) => createElement('button', {}, children),
  };
});
import { TopicGenerationStatus } from './topic-generation-status';
import { topicProgressSchema, type TopicTask } from '../lib/topic-model';
const base: TopicTask = {
  ...topicProgressSchema.parse({ skillRevision: 'fixture', demandCount: 48, sourceCount: 4 }),
  id: 'fixture',
  status: 'failed',
  reason: '浏览器操作超时',
  createdAt: '2026-10-30T00:00:00Z',
  updatedAt: '2026-10-30T00:00:00Z',
};
test('失败不能伪装成完成，无结果与中断分别说明；网页材料和需求词不混算', () => {
  const failed = renderToStaticMarkup(<TopicGenerationStatus task={base} starting={false} onRecover={() => {}} />);
  expect(failed).toContain('找题中断，尚未交付候选');
  expect(failed).toContain('用已读材料继续');
  expect(failed).toContain('可用网页材料 4 份');
  expect(failed).toContain('参考需求词 48 条');
  const empty = renderToStaticMarkup(
    <TopicGenerationStatus task={{ ...base, status: 'completed', reason: null }} starting={false} />,
  );
  expect(empty).toContain('研究已结束，本轮没有合格候选');
  const recovery = renderToStaticMarkup(
    <TopicGenerationStatus task={{ ...base, resumeFrom: 'old', status: 'running' }} starting={false} />,
  );
  expect(recovery).toContain('使用已保存材料继续判断');
  expect(recovery).not.toContain('0/0');
});
