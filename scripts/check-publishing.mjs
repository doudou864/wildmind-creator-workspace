import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';
import {
  generatePublishSetting,
  updateCommonCopy,
  restorePublishSetting,
  formatPublishTags,
  platformMaterialKey,
  receiptExpired,
  receiptStatus,
  readyPublishReceipts,
  uploadPlatformIds,
  canRetryPublishReceipt,
  autoVideoCovers,
  canRetryReceipt,
  defaultPublishTime,
  makePublishSetting,
  newPublishDraft,
  publishingConfigSchema,
  publishDraftSchema,
  publishActionSchema,
  publishRetrySchema,
  publishIssues,
  scheduleTime,
} from '../src/lib/publishing-model.ts';
const config = publishingConfigSchema.parse(parse(fs.readFileSync('config/publishing-templates.yaml', 'utf8')));
const platforms = parse(fs.readFileSync('config/platforms.yaml', 'utf8')).platforms;
const choices = { '3:4': 'vertical', '4:3': 'landscape', '16:9': 'wide' };
const data = {
  contents: [
    { id: 'c1', title: '作品', form: '视频', videoCovers: choices, revision: 1, topicId: null, plannedDate: null },
  ],
  videos: [{ id: 'v1', contentId: 'c1' }],
  assets: [],
  snapshots: [],
  batches: [],
  receipts: [],
  accounts: platforms.map((p) => ({ platformId: p.id, ready: true })),
  recommendations: [],
  storageReady: true,
  aiReady: false,
  publishReady: true,
  handoffReady: true,
  message: '',
};
const asset = (id, ratio, w, h, patch = {}) => ({
  id,
  ratio,
  width: w,
  height: h,
  contentId: 'c1',
  purposeId: 'video_cover',
  selected: true,
  source: 'upload',
  ...patch,
});
const assets = [
  asset('vertical', '3:4', 750, 1000),
  asset('landscape', '4:3', 1200, 900),
  asset('wide', '16:9', 1600, 900),
];
const verified = {
  ...config,
  templates: config.templates.map((t) => ({ ...t, verified: true, titleMax: 1000, descriptionMax: 100000 })),
};
const now = Date.parse('2026-10-17T08:00:00+08:00');
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}
check('未知平台限制与时间保持 null，不伪造推荐', () => {
  assert(config.templates.every((t) => t.titleMax === null && t.defaultTime === null && !t.verified));
  assert.equal(makePublishSetting('douyin', '标题', config).scheduleAt, null);
});
check('新建批次不默认替用户勾选发布目标', () => assert.deepEqual(newPublishDraft('video').settings, []));
check('封面采用明确资产而非素材库当前选定版，仍核对作品和真实尺寸', () => {
  const result = autoVideoCovers(
    'c1',
    [...assets, asset('other', '3:4', 750, 1000, { contentId: 'c2' }), asset('fake', '3:4', 1600, 900)],
    config,
    choices,
  );
  assert.equal(result[0].asset.id, 'vertical');
  assert.equal(result[2].asset.id, 'wide');
  assert.equal(autoVideoCovers('c1', assets, config, { '3:4': 'wide' })[0].asset, null);
  assert.equal(autoVideoCovers('c2', assets, config, choices)[0].asset, null);
});
check('多组默认选版不阻塞明确的作品采用，也不自动替用户采用', () => {
  assert.equal(
    autoVideoCovers('c1', [...assets, asset('duplicate', '3:4', 750, 1000)], config, choices)[0].asset.id,
    'vertical',
  );
  assert.equal(autoVideoCovers('c1', assets, config)[0].asset, null);
});
check('没有作品关联时不自动抓其他作品封面', () =>
  assert(autoVideoCovers(null, assets, config).every((c) => c.asset === null)),
);
const video = {
  ...newPublishDraft('video'),
  contentId: 'c1',
  videoId: 'v1',
  settings: [makePublishSetting('douyin', '标题', config)],
};
check('完整视频材料通过内容校验，模板未核验仍阻断', () => {
  assert.deepEqual(publishIssues(video, { ...data, assets }, verified, platforms, now), []);
  assert(publishIssues(video, { ...data, assets }, config, platforms, now).some((s) => s.includes('待核验')));
});
check('视频三种封面缺一不可，即使某目标只用一种', () =>
  assert(
    publishIssues(video, { ...data, assets: assets.slice(0, 2) }, verified, platforms, now).some((s) =>
      s.includes('16:9'),
    ),
  ),
);
check('不能使用其他作品的视频', () =>
  assert(
    publishIssues({ ...video, videoId: 'foreign' }, data, verified, platforms, now).some((s) => s.includes('成片')),
  ),
);
check('平台停用或账号不就绪都阻断', () => {
  assert(
    publishIssues(video, { ...data, assets, accounts: [] }, verified, platforms, now).some((s) => s.includes('账号')),
  );
  assert(
    publishIssues(
      { ...video, settings: [makePublishSetting('tiktok', '标题', config)] },
      { ...data, assets },
      verified,
      platforms,
      now,
    ).some((s) => s.includes('未启用')),
  );
});
check('按 Unicode 字符计标题，边界等于上限可用', () => {
  const cfg = { ...verified, templates: verified.templates.map((t) => ({ ...t, titleMax: 2 })) };
  assert(
    !publishIssues(
      { ...video, settings: [{ ...video.settings[0], title: '你😀' }] },
      { ...data, assets },
      cfg,
      platforms,
      now,
    ).some((s) => s.includes('超过')),
  );
  assert(
    publishIssues(
      { ...video, settings: [{ ...video.settings[0], title: '你😀好' }] },
      { ...data, assets },
      cfg,
      platforms,
      now,
    ).some((s) => s.includes('超过')),
  );
});
check('定时以北京时间校验，拒绝不存在的日期和过去时间', () => {
  assert.equal(scheduleTime('2026-10-17T09:00'), Date.parse('2026-10-17T01:00:00Z'));
  assert(Number.isNaN(scheduleTime('2026-02-30T09:00')));
  for (const scheduleAt of ['', '2026-10-17T07:00', '2026-02-30T09:00'])
    assert(
      publishIssues(
        { ...video, settings: [{ ...video.settings[0], scheduleAt }] },
        { ...data, assets },
        verified,
        platforms,
        now,
      ).some((s) => s.includes('时间')),
    );
});
const snap = {
  id: 's1',
  platform: 'douyin',
  contentId: 'c1',
  state: 'ready',
  content: { title: '确认标题', blocks: [{ id: 'p', type: 'paragraph', text: '确认正文', assetId: null }], covers: {} },
};
const layout = {
  ...newPublishDraft('layout'),
  contentId: 'c1',
  snapshotIds: ['s1'],
  settings: [makePublishSetting('douyin', '确认标题', verified)],
};
check('确认稿标题与正文不可在发布中心改写', () => {
  assert.deepEqual(
    publishIssues(
      layout,
      { ...data, contents: data.contents.map((c) => ({ ...c, form: '图文' })), snapshots: [snap] },
      verified,
      platforms,
      now,
    ),
    [],
  );
  for (const patch of [{ title: '被改写' }, { description: '偷偷增加正文' }])
    assert(
      publishIssues(
        { ...layout, settings: [{ ...layout.settings[0], ...patch }] },
        { ...data, contents: data.contents.map((c) => ({ ...c, form: '图文' })), snapshots: [snap] },
        verified,
        platforms,
        now,
      ).some((s) => s.includes('不可改写')),
    );
});
check('撤回、跨作品、重复的确认稿均不可发布', () => {
  for (const snapshots of [
    [{ ...snap, state: 'returned' }],
    [{ ...snap, contentId: 'c2' }],
    [snap, { ...snap, id: 's2' }],
  ])
    assert(
      publishIssues(
        { ...layout, snapshotIds: ['s1', 's2'] },
        { ...data, contents: data.contents.map((c) => ({ ...c, form: '图文' })), snapshots },
        verified,
        platforms,
        now,
      ).length > 0,
    );
});
const xhs = {
  ...newPublishDraft('xhs'),
  contentId: 'c1',
  imageIds: ['user-image'],
  settings: [makePublishSetting('xiaohongshu', '自制图文', config)],
};
check('小红书只允许用户上传图，不允许 AI 素材替代', () => {
  assert.deepEqual(
    publishIssues(
      xhs,
      {
        ...data,
        contents: data.contents.map((c) => ({ ...c, form: '图文' })),
        assets: [asset('user-image', '3:4', 750, 1000)],
      },
      verified,
      platforms,
      now,
    ),
    [],
  );
  assert(
    publishIssues(
      xhs,
      {
        ...data,
        contents: data.contents.map((c) => ({ ...c, form: '图文' })),
        assets: [asset('user-image', '3:4', 750, 1000, { source: 'ai' })],
      },
      verified,
      platforms,
      now,
    ).some((s) => s.includes('用户上传')),
  );
});
check('来源不可混用且目标平台不能重复', () => {
  assert.equal(publishDraftSchema.safeParse({ ...video, imageIds: ['bad'] }).success, false);
  assert.equal(
    publishDraftSchema.safeParse({ ...video, settings: [video.settings[0], video.settings[0]] }).success,
    false,
  );
});
check('未人工确认、缺请求 ID、伪造确认快照的发布请求被拒绝', () => {
  const base = {
    action: 'publish-all',
    receipts: [{ id: 'r1', expectedRevision: 0 }],
    expectedRevision: 0,
    requestId: 'a4c13b91-bc65-4c74-8b1a-cac2d1bc1558',
    confirmed: true,
    materials: 'checked-materials',
  };
  assert.equal(publishActionSchema.safeParse(base).success, true);
  for (const patch of [{ confirmed: false }, { requestId: undefined }, { snapshots: [] }])
    assert.equal(publishActionSchema.safeParse({ ...base, ...patch }).success, false);
});
check('发布中、成功和结果不明都不能重试', () => {
  for (const status of ['queued', 'submitting', 'pending_review', 'published', 'unknown'])
    assert.equal(canRetryReceipt({ status, safeToRetry: true }), false);
  assert.equal(canRetryReceipt({ status: 'failed', safeToRetry: false }), false);
  assert.equal(canRetryReceipt({ status: 'failed', safeToRetry: true }), true);
  assert.equal(publishRetrySchema.safeParse({ expectedRevision: 0, confirmed: true }).success, false);
});
check('只使用本月观看分布；错过今天的时段则使用下一天', () => {
  const old = {
    ...data,
    recommendations: [{ platformId: 'douyin', month: '2026-09', time: '19:00', basis: '旧月份' }],
  };
  assert.equal(defaultPublishTime('douyin', old, config, now), null);
  assert.equal(
    defaultPublishTime(
      'douyin',
      { ...data, recommendations: [{ platformId: 'douyin', month: '2026-10', time: '07:00', basis: '月度观看分布' }] },
      config,
      now,
    ),
    '2026-10-18T07:00',
  );
  assert.equal(
    defaultPublishTime(
      'douyin',
      { ...data, recommendations: [{ platformId: 'douyin', month: '2026-10', time: '19:00', basis: '月度观看分布' }] },
      config,
      now,
    ),
    '2026-10-17T19:00',
  );
});
check('仅打开 verified 不能绕过未知标题限制', () => {
  const incomplete = { ...config, templates: config.templates.map((t) => ({ ...t, verified: true })) };
  assert(publishIssues(video, { ...data, assets }, incomplete, platforms, now).some((s) => s.includes('待核验')));
});

const complete = { ...data, assets };
const shared = { title: '一次填写的完整标题', description: '不应在半句话处硬截断的完整简介。', tags: ['工具', '效率'] };
let multi = { ...video, commonCopy: shared, settings: [] };
multi.settings = ['douyin', 'xiaohongshu', 'bilibili'].map((id) =>
  generatePublishSetting(id, multi, complete, verified, now),
);
check('三个平台共用一次填写的标题简介话题，超长只提示而不截断', () => {
  for (const item of multi.settings) {
    assert.equal(item.title, shared.title);
    assert.equal(item.description, shared.description);
    assert.deepEqual(item.tags, shared.tags);
    assert.equal(item.individuallyEdited, false);
  }
  const tiny = { ...verified, templates: verified.templates.map((t) => ({ ...t, titleMax: 2, descriptionMax: 3 })) };
  assert.equal(generatePublishSetting('douyin', multi, complete, tiny, now).title, shared.title);
  assert(publishIssues(multi, complete, tiny, platforms, now).filter((s) => s.includes('超过')).length === 6);
});
check('只同步未单独修改的平台，保护整份平台设置；恢复后重新跟随通用文案', () => {
  const edited = {
    ...multi,
    settings: multi.settings.map((s, i) =>
      i === 0 ? { ...s, title: '单独标题', scheduleAt: '2026-10-18T21:00', individuallyEdited: true } : s,
    ),
  };
  const next = updateCommonCopy(edited, { ...shared, title: '第二版', description: '新简介' }, complete, verified, now);
  assert.deepEqual(next.settings[0], edited.settings[0]);
  assert.equal(next.settings[1].title, '第二版');
  const restored = restorePublishSetting(next, 'douyin', complete, verified, now);
  assert.equal(restored.settings[0].title, '第二版');
  assert.equal(restored.settings[0].individuallyEdited, false);
  assert.equal(restored.settings[0].scheduleAt, null);
  assert.equal(
    updateCommonCopy(restored, { ...shared, title: '第三版' }, complete, verified, now).settings[0].title,
    '第三版',
  );
});
check('话题包裹和分隔完全由模板决定，不重复加井号', () => {
  const cfg = {
    ...verified,
    templates: verified.templates.map((t) => ({ ...t, tagFormat: { prefix: '#', suffix: '#', separator: ' / ' } })),
  };
  assert.equal(formatPublishTags(['#工具', '效率#'], 'douyin', cfg), '#工具# / #效率#');
});
check('自动版本使用本月推荐优先于模板默认时间，无推荐则回退模板', () => {
  const cfg = { ...verified, templates: verified.templates.map((t) => ({ ...t, defaultTime: '18:00' })) };
  assert.equal(generatePublishSetting('douyin', multi, complete, cfg, now).scheduleAt, '2026-10-17T18:00');
  assert.equal(
    generatePublishSetting(
      'douyin',
      multi,
      { ...complete, recommendations: [{ platformId: 'douyin', month: '2026-10', time: '20:00' }] },
      cfg,
      now,
    ).scheduleAt,
    '2026-10-17T20:00',
  );
});
check('排版自动版本仍然采用确认标题与只读正文；小红书采用通用文案', () => {
  const d = { ...layout, commonCopy: shared };
  const item = generatePublishSetting('douyin', d, { ...complete, snapshots: [snap] }, verified, now);
  assert.equal(item.title, snap.content.title);
  assert.equal(item.description, '');
  assert.equal(
    generatePublishSetting('xiaohongshu', { ...xhs, commonCopy: shared }, complete, verified, now).description,
    shared.description,
  );
});
const ready = (platformId, patch = {}) => ({
  id: platformId,
  batchId: 'b1',
  platformId,
  status: 'ready',
  title: shared.title,
  screenshotAssetId: `screen-${platformId}`,
  uploadedAt: new Date(now).toISOString(),
  materials: platformMaterialKey(multi, platformId, complete, verified),
  failureStage: null,
  safeToRetry: false,
  revision: 1,
  platformPostId: null,
  url: null,
  publishedAt: null,
  reason: null,
  ...patch,
});
const receipts = multi.settings.map((s) => ready(s.platformId));
check('两小时边界与配置生效，缺失/未来时间不能绕过过期', () => {
  assert.equal(receiptExpired(receipts[0], now + 2 * 3600000 - 1, 2), false);
  assert.equal(receiptExpired(receipts[0], now + 2 * 3600000, 2), true);
  assert.equal(receiptExpired(receipts[0], now + 3600000, 0.5), true);
  for (const uploadedAt of [null, 'bad', new Date(now + 1).toISOString()])
    assert(receiptExpired({ ...receipts[0], uploadedAt }, now, 2));
});
check('就绪必须有截图且材料未变，发布中和成功不会因截图变旧重新开放上传', () => {
  assert.equal(
    receiptStatus({ ...receipts[0], screenshotAssetId: null }, multi, complete, verified, now, 2),
    'expired',
  );
  assert.equal(receiptStatus({ ...receipts[0], materials: 'old' }, multi, complete, verified, now, 2), 'expired');
  for (const status of ['submitting', 'pending_review', 'published', 'unknown'])
    assert.equal(receiptStatus({ ...receipts[0], status }, multi, complete, verified, now + 3 * 3600000, 2), status);
});
check('仅发布本批次已就绪项，其他平台失败不阻断；重复回执不放行', () => {
  const mixed = {
    ...complete,
    receipts: [receipts[0], { ...receipts[1], status: 'failed' }, { ...receipts[2], batchId: 'other' }],
  };
  assert.deepEqual(
    readyPublishReceipts('b1', multi, mixed, verified, platforms, now, 2).map((r) => r.platformId),
    ['douyin'],
  );
  assert.equal(
    readyPublishReceipts(
      'b1',
      multi,
      { ...mixed, receipts: [receipts[0], { ...receipts[0], id: 'duplicate' }] },
      verified,
      platforms,
      now,
      2,
    ).length,
    0,
  );
});
check('修改通用文案不使已单独修改平台的截图失效，其他平台变化也不影响它', () => {
  const edited = {
    ...multi,
    settings: multi.settings.map((s, i) => (i === 0 ? { ...s, individuallyEdited: true } : s)),
  };
  const before = platformMaterialKey(edited, 'douyin', complete, verified);
  const next = updateCommonCopy(edited, { ...shared, title: '新通用' }, complete, verified, now);
  assert.equal(platformMaterialKey(next, 'douyin', complete, verified), before);
  assert.notEqual(
    platformMaterialKey(next, 'xiaohongshu', complete, verified),
    platformMaterialKey(edited, 'xiaohongshu', complete, verified),
  );
});
check('上传排除就绪、执行中、成功及未知项；只允许安全失败或过期目标', () => {
  for (const status of ['ready', 'queued', 'uploading', 'submitting', 'pending_review', 'published', 'unknown'])
    assert(
      !uploadPlatformIds(
        'b1',
        multi,
        { ...complete, receipts: [{ ...receipts[0], status }] },
        verified,
        now,
        2,
      ).includes('douyin'),
    );
  assert(
    uploadPlatformIds(
      'b1',
      multi,
      { ...complete, receipts: [{ ...receipts[0], status: 'expired' }] },
      verified,
      now,
      2,
    ).includes('douyin'),
  );
  assert(
    !uploadPlatformIds(
      'b1',
      multi,
      { ...complete, receipts: [{ ...receipts[0], status: 'failed', failureStage: 'upload', safeToRetry: false }] },
      verified,
      now,
      2,
    ).includes('douyin'),
  );
  assert(
    uploadPlatformIds(
      'b1',
      multi,
      { ...complete, receipts: [{ ...receipts[0], status: 'failed', failureStage: 'upload', safeToRetry: true }] },
      verified,
      now,
      2,
    ).includes('douyin'),
  );
});
check('发布失败须确认未发布且截图新鲜，上传失败和过期只走重新上传', () => {
  const failed = { ...receipts[0], status: 'failed', failureStage: 'publish', safeToRetry: true };
  assert(canRetryPublishReceipt(failed, multi, complete, verified, now, 2, platforms));
  for (const patch of [
    { failureStage: 'upload' },
    { safeToRetry: false },
    { materials: 'changed' },
    { screenshotAssetId: null },
  ])
    assert(!canRetryPublishReceipt({ ...failed, ...patch }, multi, complete, verified, now, 2, platforms));
  assert(!canRetryPublishReceipt(failed, multi, complete, verified, now + 3 * 3600000, 2, platforms));
});
check('上传与最终发布接口严格分开，拒绝旧发布动作和空/重复目标', () => {
  const input = {
    action: 'upload',
    expectedRevision: 1,
    requestId: 'a4c13b91-bc65-4c74-8b1a-cac2d1bc1558',
    platformIds: ['douyin'],
    materials: 'materials',
  };
  assert(publishActionSchema.safeParse(input).success);
  for (const patch of [
    { platformIds: [] },
    { platformIds: ['douyin', 'douyin'] },
    { confirmed: true },
    { action: 'publish' },
  ])
    assert(!publishActionSchema.safeParse({ ...input, ...patch }).success);
  const final = {
    action: 'publish-all',
    expectedRevision: 1,
    requestId: input.requestId,
    materials: 'materials',
    confirmed: true,
    receipts: [{ id: 'r1', expectedRevision: 1 }],
  };
  assert(publishActionSchema.safeParse(final).success);
  for (const patch of [
    { receipts: [] },
    { receipts: [final.receipts[0], final.receipts[0]] },
    { confirmed: false },
    { materials: '' },
  ])
    assert(!publishActionSchema.safeParse({ ...final, ...patch }).success);
});
const { request } = await import('../src/ui/use-resource.ts');
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => {
    throw new TypeError('Failed to fetch');
  };
  await assert.rejects(
    () => request('/test'),
    (error) => error.message.includes('无法连接本机服务') && !error.message.includes('Failed to fetch'),
  );
  globalThis.fetch = async () => Response.json({ error: 'Internal Server Error' }, { status: 500 });
  await assert.rejects(() => request('/test'), /请求失败（500）/);
  globalThis.fetch = async () => new Response('not-json', { status: 503 });
  await assert.rejects(() => request('/test'), /服务响应无法读取/);
  globalThis.fetch = async () => Response.json({ error: '上传服务尚未接入' }, { status: 503 });
  await assert.rejects(() => request('/test'), /上传服务尚未接入/);
  passed++;
  console.log('PASS 网络、英文服务错误和无效响应转换中文；保留中文业务原因');
} finally {
  globalThis.fetch = originalFetch;
}
console.log(`${passed} publishing checks passed`);
