import { test, expect } from 'vitest';
import type { Judgment } from '../ai/structured';
import { readCommentEngagement } from './inbox-engagement';
test('截图未显示的热度保留未知；拒绝重复或缺失的评论映射，避免把别人的热度算给该评论', async () => {
  const rows = [
    { author: '甲', body: '求具体帮助' },
    { author: '乙', body: '普通评价' },
  ];
  const judgment = {
    read: async () => ({
      items: [
        { key: '1', likes: null, replyCount: null },
        { key: '0', likes: 10, replyCount: 5 },
      ],
    }),
  } as unknown as Judgment;
  expect(await readCommentEngagement(judgment, 'evidence.png', rows)).toEqual([
    { likes: 10, replyCount: 5 },
    { likes: null, replyCount: null },
  ]);
  const duplicate = {
    read: async () => ({
      items: [
        { key: '0', likes: 10, replyCount: 5 },
        { key: '0', likes: 10, replyCount: 5 },
      ],
    }),
  } as unknown as Judgment;
  await expect(readCommentEngagement(duplicate, 'evidence.png', rows)).rejects.toThrow('不一一对应');
});
