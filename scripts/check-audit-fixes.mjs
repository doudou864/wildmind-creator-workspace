import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';
import { contentInputSchema, contentCoverSchema, contentMatches } from '../src/lib/content-model.ts';
import { createLayout, layoutPayload, layoutSaveSchema, layoutIssues } from '../src/lib/layout-model.ts';
import { imageSlots, canReuseAsset, assetMetadataSchema } from '../src/lib/image-model.ts';
import {
  autoVideoCovers,
  publishMaterialKey,
  publishActionSchema,
  newPublishDraft,
} from '../src/lib/publishing-model.ts';
import { dealActionGroups } from '../src/lib/deal-model.ts';
import { assessReplies, waitingCount } from '../src/lib/inbox-model.ts';
import { themeSyncSchema } from '../src/lib/workspace-model.ts';
const imageConfig = parse(fs.readFileSync('config/image-styles.yaml', 'utf8'));
const layoutConfig = parse(fs.readFileSync('config/layout-styles.yaml', 'utf8'));
const publishConfig = parse(fs.readFileSync('config/publishing-templates.yaml', 'utf8'));
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}
const content = {
  id: 'c1',
  updatedAt: '2026-10-17T00:00:00Z',
  title: '作品',
  topicId: 't1',
  form: '视频',
  plannedDate: '2026-10-17',
  videoCovers: { '3:4': 'a' },
};
check('同一选题可关联多条作品，跨选题和不同形式不混选', () => {
  assert(contentMatches(content, 't1', '视频'));
  assert(contentMatches({ ...content, id: 'c2' }, 't1', '视频'));
  assert(!contentMatches(content, 't2'));
  assert(!contentMatches(content, 't1', '图文'));
});
check('计划日期必须是实际存在的日期，未知日期允许为空', () => {
  const input = { title: '文章', topicId: 't1', form: '图文', plannedDate: null };
  assert(contentInputSchema.safeParse(input).success);
  for (const plannedDate of ['2026-02-30', '2026-99-01'])
    assert(!contentInputSchema.safeParse({ ...input, plannedDate }).success);
});
check('排版保存保留作品身份，三版共用同一作品', () => {
  const payload = layoutPayload(createLayout('标题\n正文', 'article-1'));
  assert.equal(payload.contentId, 'article-1');
  assert(layoutSaveSchema.safeParse(payload).success);
});
const asset = {
  id: 'a',
  familyId: 'f',
  updatedAt: '2026-10-17T00:00:00Z',
  title: '手工封面',
  purposeId: 'video_cover',
  ratio: '3:4',
  width: 750,
  height: 1000,
  contentId: 'c1',
  topicId: 't1',
  source: 'upload',
  prompt: '',
  version: 1,
  selected: false,
  createdAt: '2026-10-17T00:00:00Z',
};
check('手工上传封面可采用，来源与用途分开', () =>
  assert.equal(autoVideoCovers('c1', [asset], publishConfig, content.videoCovers)[0].asset.id, 'a'),
);
check('多图片组不互相取消默认选版，采用关系仍唯一明确', () => {
  const other = { ...asset, id: 'b', familyId: 'g', selected: true };
  assert.equal(autoVideoCovers('c1', [asset, other], publishConfig, { '3:4': 'b' })[0].asset.id, 'b');
  assert.equal(autoVideoCovers('c1', [asset, other], publishConfig, {})[0].asset, null);
});
check('作品采用关系可以直接更新或解除，无需修订号', () => {
  assert(contentCoverSchema.safeParse({ ratio: '3:4', assetId: null }).success);
  assert(contentCoverSchema.safeParse({ ratio: '3:4', assetId: 'a' }).success);
});
check('已有上传图片可生成修改版而不是零个输出', () =>
  assert.equal(
    imageSlots({ purposeId: 'upload', parentAssetId: 'a', ratio: '3:4', editInstruction: '修改文字' }, imageConfig)
      .length,
    1,
  ),
);
check('抖音段落复用拒绝横图，与排版规则一致', () => {
  const slot = imageSlots({ purposeId: 'douyin_images', parentAssetId: null, content: '段落' }, imageConfig)[0];
  const wide = { ...asset, id: 'wide', width: 1600, height: 900 };
  assert(!canReuseAsset(wide, slot));
  const variant = {
    ...createLayout('标题\n正文').variants.douyin,
    blocks: [
      { id: 'text', type: 'paragraph', text: '文案', assetId: null },
      { id: 'img', type: 'image', text: '', assetId: 'wide' },
    ],
  };
  assert(layoutIssues(variant, 'douyin', [wide], layoutConfig).some((s) => s.includes('3:4')));
});
check('普通文章插图保留任意比例复用，不强制裁切用户图片', () => {
  const slot = imageSlots({ purposeId: 'illustration', parentAssetId: null, content: '段落' }, imageConfig)[0];
  assert(canReuseAsset({ ...asset, width: 1600, height: 900 }, slot));
});
const draft = {
  ...newPublishDraft('video'),
  contentId: 'c1',
  videoId: 'v',
  settings: [
    { platformId: 'douyin', title: '标题', description: '', tags: [], scheduleAt: null, individuallyEdited: false },
  ],
};
const data = {
  contents: [content],
  videos: [{ id: 'v', contentId: 'c1' }],
  assets: [asset],
  snapshots: [],
  accounts: [],
};
check('未关联选版元数据不改变已采用文件的指纹', () => {
  const next = {
    ...data,
    assets: [
      { ...asset, selected: true, updatedAt: '2026-10-17T01:00:00Z' },
      { ...asset, id: 'new', version: 2, selected: false },
    ],
  };
  assert.equal(publishMaterialKey(draft, next, publishConfig), publishMaterialKey(draft, data, publishConfig));
});
check('作品改用新封面后旧人工核对指纹必须失效', () => {
  const next = {
    ...data,
    contents: [{ ...content, updatedAt: '2026-10-17T01:00:00Z', videoCovers: { '3:4': 'new' } }],
    assets: [asset, { ...asset, id: 'new', version: 2 }],
  };
  assert.notEqual(publishMaterialKey(draft, next, publishConfig), publishMaterialKey(draft, data, publishConfig));
});
check('发布确认请求必须包含实际核对材料，不能只有勾选布尔值', () => {
  const input = {
    action: 'publish-all',
    receipts: [{ id: 'r1', expectedRevision: 0 }],
    confirmed: true,
    requestId: 'a4c13b91-bc65-4c74-8b1a-cac2d1bc1558',
    expectedRevision: 1,
  };
  assert(!publishActionSchema.safeParse(input).success);
  assert(
    publishActionSchema.safeParse({ ...input, materials: publishMaterialKey(draft, data, publishConfig) }).success,
  );
});
check('用途修改无需版本，但不能伪造图片来源', () => {
  const input = { title: '封面', purposeId: 'video_cover', topicId: 't1', contentId: 'c1' };
  assert(assetMetadataSchema.safeParse(input).success);
  assert(!assetMetadataSchema.safeParse({ ...input, source: 'ai' }).success);
});
const msg = (id, platformId = 'douyin') => ({
  id,
  platformId,
  channel: 'dm',
  sentAt: '2026-10-17T01:00:00Z',
  capturedAt: '2026-10-17T02:00:00Z',
  reply: {
    kind: 'dm',
    conversationId: 'same',
    latestConfirmed: true,
    lastSender: 'other',
    lastMessageAt: '2026-10-17T01:00:00Z',
  },
});
const messages = [msg('m1'), msg('m2'), msg('m3', 'xiaohongshu')];
const deals = messages.map((m, i) => ({
  id: 'd' + i,
  source: { platformId: m.platformId, channel: 'dm', messageId: m.id },
}));
check('同会话待办合并并保留全部商单，跨平台不合并', () => {
  const groups = dealActionGroups(deals, messages, assessReplies(messages));
  assert.equal(groups.length, waitingCount(messages));
  assert.equal(groups[0].deals.length, 2);
  assert.equal(groups.length, 2);
});
check('主题送选题必须核对主题版本，不允许客户端替换来源', () => {
  assert(themeSyncSchema.safeParse({ expectedRevision: 1 }).success);
  assert(!themeSyncSchema.safeParse({ expectedRevision: 1, messageIds: ['fake'] }).success);
});
check('生产与复盘均承认小红书、视频号图文形式', () => {
  const platforms = parse(fs.readFileSync('config/platforms.yaml', 'utf8')).platforms;
  for (const id of ['xiaohongshu', 'channels']) assert(platforms.find((p) => p.id === id).forms.includes('图文'));
});

const { selectAssetVersion, imageDraftSchema } = await import('../src/lib/image-model.ts');
check('一键选版同时采用到作品，另一比例及其他家族保持不变', () => {
  const c = { ...content, videoCovers: { '3:4': 'old', '16:9': 'wide' } };
  const old = { ...asset, id: 'old', selected: true };
  const other = { ...asset, id: 'other', familyId: 'other-family', selected: true };
  const result = selectAssetVersion([asset, old, other], [c], 'a', imageConfig, '2026-10-17T12:00:00Z');
  assert.equal(result.asset.selected, true);
  assert.deepEqual(result.content.videoCovers, { '3:4': 'a', '16:9': 'wide' });
  assert.equal(result.assets.find((a) => a.id === 'old').selected, false);
  assert.equal(result.assets.find((a) => a.id === 'other').selected, true);
  assert.equal(c.videoCovers['3:4'], 'old'); // transaction inputs aren't mutated on failure
  assert.throws(
    () => selectAssetVersion([{ ...asset, width: 900, height: 900 }], [c], 'a', imageConfig, 'now'),
    /比例/,
  );
  const unlinked = selectAssetVersion([{ ...asset, contentId: null }], [], 'a', imageConfig, 'now');
  assert.equal(unlinked.content, null);
  assert(unlinked.asset.selected);
});
check('普通编辑不接受旧修订字段', () => {
  assert(
    !assetMetadataSchema.safeParse({
      title: '图',
      purposeId: 'free',
      topicId: null,
      contentId: null,
      expectedRevision: 1,
    }).success,
  );
  assert(!contentCoverSchema.safeParse({ ratio: '3:4', assetId: 'a', expectedRevision: 1 }).success);
  const draft = {
    uploadPurposeId: 'free',
    title: '任务',
    purposeId: 'free',
    styleId: 'default',
    prompt: '',
    content: '',
    ratio: '3:4',
    topicId: null,
    contentId: null,
    existingAssets: {},
    parentAssetId: null,
    editInstruction: '',
  };
  assert(imageDraftSchema.safeParse(draft).success);
  assert(!imageDraftSchema.safeParse({ ...draft, expectedRevision: 1 }).success);
});
console.log(`${passed} audit regression checks passed`);
