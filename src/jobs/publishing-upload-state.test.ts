import { expect, test } from 'vitest';
import { uploadRunSchema } from './publishing-upload-state';

test('审核时的声明和选项证据随任务保留，发布复核无需从标题猜声明', () => {
  const reviewObservation = {
    snapshot: '声明原创\n含AI生成内容\n不定时',
    controls: [
      { label: '原创声明', checked: true },
      { label: '含AI生成内容', checked: null },
    ],
  };
  const parsed = uploadRunSchema.parse({
    requestId: 'fixture',
    declarations: { aiGenerated: true, paidPromotion: false },
    video: '/fixture/video.mp4',
    sha256: 'fixture',
    covers: {},
    platforms: [
      {
        id: 'channels',
        page: 'p2',
        stage: 'ready',
        attempted: false,
        accountVerified: true,
        copy: { title: '隔离测试', description: '', tags: [] },
        reason: null,
        reviewObservation,
      },
    ],
  });
  expect(JSON.parse(JSON.stringify(parsed)).platforms[0].reviewObservation).toEqual(reviewObservation);
  expect(JSON.parse(JSON.stringify(parsed)).declarations).toEqual({ aiGenerated: true, paidPromotion: false });
});
