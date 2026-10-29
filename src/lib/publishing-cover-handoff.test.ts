import { expect, test } from 'vitest';
import {
  editableCoverBatch,
  handoffAsset,
  initialPublishingBatch,
  prepareCoverHandoff,
} from './publishing-cover-handoff';
import { newPublishDraft, type PublishReceipt, type PublishingConfig, type PublishingData } from './publishing-model';

const config = {
  requiredVideoRatios: ['3:4', '4:3', '16:9'],
  coverRatioTolerancePixels: 2,
} as PublishingConfig;
function fixture(): PublishingData {
  const stamp = '2026-10-30T00:00:00Z';
  return {
    topics: [{ id: 'topic', title: '已选方向' }],
    contents: [
      {
        id: 'content',
        title: '原主题',
        form: '视频',
        topicId: null,
        videoCovers: {},
        plannedDate: null,
        updatedAt: stamp,
      },
    ],
    assets: [
      {
        id: 'cover',
        familyId: 'family',
        updatedAt: stamp,
        createdAt: stamp,
        title: '封面文件名',
        purposeId: 'free',
        ratio: '3:4',
        width: 750,
        height: 1000,
        mime: 'image/png',
        topicId: null,
        contentId: null,
        source: 'ai',
        prompt: '原文',
        version: 1,
        selected: false,
      },
    ],
    batches: [
      {
        id: 'batch',
        revision: 3,
        state: 'draft',
        createdAt: stamp,
        draft: {
          ...newPublishDraft('video'),
          contentId: 'content',
          commonCopy: { title: '原主题', description: '原简介', tags: ['原标签'] },
          videoInput: {
            topicId: null,
            path: '/fixture/video.mp4',
            covers: { '3:4': 'old-cover', '16:9': 'wide-cover' },
          },
        },
      },
    ],
    videos: [],
    snapshots: [],
    tasks: [],
    receipts: [],
    accounts: [],
    recommendations: [],
    storageReady: true,
    aiReady: true,
    uploadReady: true,
    publishReady: true,
    handoffReady: true,
    message: '',
  };
}
const input = () => ({
  assetId: 'cover',
  batchId: 'batch' as string | null,
  ratio: '3:4',
  title: '新主题',
  topicId: 'topic' as string | null,
  replaceConfirmed: false,
});

test('带入封面或失效的明确 batch 不得悄悄打开最近另一条草稿；刷新始终恢复指定记录', () => {
  const data = fixture();
  data.batches.push({ ...structuredClone(data.batches[0]), id: 'newer', createdAt: '2026-10-31T00:00:00Z' });
  const base = { batchId: null, assetId: null, contentId: null, kind: 'video' as const };
  expect(initialPublishingBatch(data, base)?.id).toBe('newer');
  expect(initialPublishingBatch(data, { ...base, assetId: 'cover' })).toBeNull();
  expect(initialPublishingBatch(data, { ...base, batchId: 'missing' })).toBeNull();
  expect(initialPublishingBatch(data, { ...base, batchId: 'batch' })?.id).toBe('batch');
  data.batches[0].draft = newPublishDraft('xhs');
  expect(initialPublishingBatch(data, { ...base, batchId: 'batch' })?.draft.kind).toBe('xhs');
});

test('原比例由配置和真实尺寸匹配，不把任意图片裁成所需封面', () => {
  const data = fixture();
  expect(handoffAsset(data, config, 'cover').ratios).toEqual(['3:4']);
  data.assets[0].width = 1000;
  expect(handoffAsset(data, config, 'cover').error).toContain('比例');
  expect(() => prepareCoverHandoff(fixture(), config, { ...input(), ratio: '16:9' })).toThrow('比例');
});

test('归档或不存在的图片不能通过旧链接重新采用', () => {
  const data = fixture();
  Object.assign(data.assets[0], { archivedAt: '2026-10-30' });
  expect(() => prepareCoverHandoff(data, config, input())).toThrow('归档');
  expect(() => prepareCoverHandoff(fixture(), config, { ...input(), assetId: 'missing' })).toThrow('不存在');
});

test('替换已有比例必须确认，确认后只改该比例，保留标题、路径、其他封面与原图归属', () => {
  const data = fixture();
  const before = structuredClone(data);
  expect(() => prepareCoverHandoff(data, config, input())).toThrow('确认替换');
  const result = prepareCoverHandoff(data, config, { ...input(), replaceConfirmed: true });
  expect(result.batch?.revision).toBe(3);
  expect(result.draft.commonCopy).toEqual(before.batches[0].draft.commonCopy);
  expect(result.draft.videoInput).toEqual({
    topicId: null,
    path: '/fixture/video.mp4',
    covers: { '3:4': 'cover', '16:9': 'wide-cover' },
  });
  expect(data).toEqual(before);
});

test('同一张已采用图片不要求替换确认，也不影响另一比例', () => {
  const data = fixture();
  data.batches[0].draft.videoInput!.covers['3:4'] = 'cover';
  expect(prepareCoverHandoff(data, config, input()).draft.videoInput?.covers['16:9']).toBe('wide-cover');
});

test('新建主题由用户或有效选题明确填写，不从图片名猜；旧草稿不继承新来源', () => {
  const data = fixture();
  expect(() => prepareCoverHandoff(data, config, { ...input(), batchId: null, title: '' })).toThrow('主题');
  const result = prepareCoverHandoff(data, config, { ...input(), batchId: null, title: '已选方向' });
  expect(result.batch).toBeNull();
  expect(result.draft.contentId).toBeNull();
  expect(result.draft.commonCopy.title).toBe('已选方向');
  expect(result.draft.videoInput?.topicId).toBe('topic');
});

test('失效来源不能静默丢弃，取消关联后才可继续', () => {
  const data = fixture();
  Object.assign(data.topics![0], { archivedAt: '2026-10-30' });
  expect(() => prepareCoverHandoff(data, config, { ...input(), batchId: null })).toThrow('明确取消关联');
  expect(
    prepareCoverHandoff(data, config, { ...input(), batchId: null, topicId: null }).draft.videoInput?.topicId,
  ).toBeNull();
});

test.each(['uploading', 'prepared', 'queued', 'running', 'finished'] as const)(
  '进入 %s 的任务不能更换封面',
  (state) => {
    const data = fixture();
    data.batches[0].state = state;
    expect(editableCoverBatch(data.batches[0], data)).toBe(false);
    expect(() => prepareCoverHandoff(data, config, { ...input(), replaceConfirmed: true })).toThrow('不可编辑');
  },
);

test('放弃、后台已开始、回执已上传及关联作品归档均不得被旧页面修改', () => {
  const abandoned = fixture();
  abandoned.batches[0].abandonedAt = '2026-10-30';
  expect(editableCoverBatch(abandoned.batches[0], abandoned)).toBe(false);
  const started = fixture();
  started.tasks = [{ batchId: 'batch' } as NonNullable<PublishingData['tasks']>[number]];
  expect(editableCoverBatch(started.batches[0], started)).toBe(false);
  const uploaded = fixture();
  uploaded.receipts = [{ batchId: 'batch', status: 'ready', uploadedAt: '2026-10-30' } as PublishReceipt];
  expect(editableCoverBatch(uploaded.batches[0], uploaded)).toBe(false);
  const archived = fixture();
  Object.assign(archived.contents[0], { archivedAt: '2026-10-30' });
  expect(editableCoverBatch(archived.batches[0], archived)).toBe(false);
});
