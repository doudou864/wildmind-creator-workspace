import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'yaml';
import {
  applyTopicDecision,
  filterTopics,
  topicFire,
  topicEvidence,
  topicDecisionInputSchema,
} from '../src/lib/topic-model.ts';
import { checkpointNote, findAnomalies } from '../src/lib/workspace-model.ts';
import { imageSlots, imageConfigSchema, canReuseAsset } from '../src/lib/image-model.ts';
let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`PASS ${name}`);
}
const parameters = parse(fs.readFileSync('config/parameters.yaml', 'utf8'));
const topic = {
  id: 't1',
  title: '测试方向',
  direction: '测试',
  channelId: 'disabled-channel',
  signal: 'test',
  sourceContext: 'test',
  sourceUrl: null,
  exploration: false,
  evidence: { count: 3, d21: 2.3, trend: '长尾型', reason: 'D21 2.3×' },
  status: 'candidate',
  frozenFire: null,
  frozenEvidence: null,
  selectedAt: null,
  revision: 0,
  createdAt: '2026-10-17T00:00:00.000Z',
  automatic: false,
};
const selected = applyTopicDecision(topic, 'selected', 0, 20, 20, '2026-10-17T01:00:00.000Z');
check('同一条记录的旧版本不能覆盖首次定格', () =>
  assert.throws(() => applyTopicDecision(selected, 'selected', 0, 0, 20, '2026-10-17T02:00:00.000Z'), /其他页面/),
);
check('不同记录单条更新互不覆盖', () => {
  const records = new Map([
    ['t1', topic],
    ['t2', { ...topic, id: 't2' }],
  ]);
  for (const id of ['t1', 't2'])
    records.set(id, applyTopicDecision(records.get(id), 'selected', 0, 20, 20, '2026-10-17T01:00:00.000Z'));
  assert.equal([...records.values()].filter((t) => t.status === 'selected').length, 2);
});
check('恢复并重选保留首次标记与整份证据', () => {
  const changed = { ...selected, evidence: { count: 9, d21: 0.2, trend: '未命中', reason: '新数据' } };
  const restored = applyTopicDecision(changed, 'candidate', 1, 0, 20, '2026-10-18T00:00:00.000Z');
  const again = applyTopicDecision(restored, 'selected', 2, 0, 20, '2026-10-19T00:00:00.000Z');
  assert.equal(again.frozenFire, true);
  assert.equal(again.selectedAt, selected.selectedAt);
  assert.deepEqual(topicEvidence(again, false), topic.evidence);
});
check('低样本首次选中不会事后变 FIRE', () => {
  const cold = applyTopicDecision(topic, 'selected', 0, 19, 20, '2026-10-17T01:00:00.000Z');
  assert.equal(topicFire(cold, true), false);
  assert.equal(topicEvidence(cold, true), null);
});
check('未选择的候选恰好达到20条才可高亮', () => {
  assert.equal(topicFire(topic, 19 >= 20), false);
  assert.equal(topicFire(topic, 20 >= 20), true);
});
check('已发布选题不可退回', () =>
  assert.throws(
    () => applyTopicDecision({ ...selected, status: 'published' }, 'candidate', 1, 20, 20, '2026-10-17T01:00:00.000Z'),
    /已发布/,
  ),
);
check('客户端不能提交定格字段', () =>
  assert.equal(
    topicDecisionInputSchema.safeParse({ status: 'selected', expectedRevision: 0, frozenFire: true }).success,
    false,
  ),
);
check('停用或移除渠道后恢复候选仍可见', () => {
  const restored = applyTopicDecision(selected, 'candidate', 1, 20, 20, '2026-10-17T01:00:00.000Z');
  assert.equal(filterTopics([restored], 'candidate', 'all', 'all', '', true).length, 1);
});
const checkpoint = {
  ratio: 4,
  baseline: 100,
  samples: 5,
  capturedAt: '2026-10-17T10:40:00+08:00',
  status: 'ready',
  provenance: 'exact',
  reason: null,
};
const work = {
  id: 'w1',
  title: '测试作品',
  form: '视频',
  published: '2026-10-13',
  state: '观察中',
  checkpoints: { 1: checkpoint, 3: { ...checkpoint, ratio: 0.1 } },
};
check('D1异常与D3异常分别返回检查点', () =>
  assert.deepEqual(
    findAnomalies([work], parameters).map((a) => a.day),
    [1, 3],
  ),
);
check('严格大于3、小于0.3，边界不误报', () =>
  assert.equal(
    findAnomalies(
      [{ ...work, checkpoints: { 1: { ...checkpoint, ratio: 3 }, 3: { ...checkpoint, ratio: 0.3 } } }],
      parameters,
    ).length,
    0,
  ),
);
check('空值、样本不足、未到点不当作零倍', () => {
  for (const point of [
    { ...checkpoint, ratio: null },
    { ...checkpoint, samples: 4 },
    { ...checkpoint, status: 'pending' },
    { ...checkpoint, status: 'missing' },
    { ...checkpoint, status: 'insufficient' },
  ])
    assert.equal(findAnomalies([{ ...work, checkpoints: { 1: point } }], parameters).length, 0);
});
check('真实零倍作为低异常', () =>
  assert.equal(findAnomalies([{ ...work, checkpoints: { 1: { ...checkpoint, ratio: 0 } } }], parameters)[0].ratio, 0),
);
check('D7不混入D1/D3异常', () =>
  assert.equal(findAnomalies([{ ...work, checkpoints: { 7: checkpoint } }], parameters).length, 0),
);
check('缺失、补抓、历史补录明确区分', () => {
  assert.match(checkpointNote({ ...checkpoint, status: 'missing' }), /采集缺失/);
  assert.match(checkpointNote({ ...checkpoint, provenance: 'backfill' }), /补抓/);
  assert.match(checkpointNote({ ...checkpoint, provenance: 'historical' }), /历史补录/);
  assert.match(checkpointNote({ ...checkpoint, status: 'insufficient' }), /样本不足/);
});
const config = imageConfigSchema.parse(parse(fs.readFileSync('config/image-styles.yaml', 'utf8')));
const draft = {
  title: '测试',
  purposeId: 'video_cover',
  styleId: 'default',
  prompt: '测试主题',
  content: '',
  ratio: '3:4',
  topicId: null,
  contentId: null,
  existingAssets: {},
  parentAssetId: null,
  editInstruction: '',
};
check('视频封面一次列出三种固定比例', () =>
  assert.deepEqual(
    imageSlots(draft, config).map((s) => s.ratio),
    ['3:4', '4:3', '16:9'],
  ),
);
check('公众号同时列出头图与转发卡片', () =>
  assert.deepEqual(
    imageSlots({ ...draft, purposeId: 'wechat_cover' }, config).map((s) => s.ratio),
    ['2.35:1', '1:1'],
  ),
);
check('文章按空行分段，不为连续换行生成空图', () =>
  assert.equal(
    imageSlots({ ...draft, purposeId: 'illustration', content: '第一段\n仍是第一段\n\n\n第二段' }, config).length,
    2,
  ),
);
check('抖音图文使用正文并保持配置竖版比例', () =>
  assert.deepEqual(
    imageSlots({ ...draft, purposeId: 'douyin_images', content: '同一份正文' }, config).map((s) => s.ratio),
    ['3:4'],
  ),
);
check('自由生图仅输出所选比例', () =>
  assert.deepEqual(
    imageSlots({ ...draft, purposeId: 'free', ratio: '16:9' }, config).map((s) => s.ratio),
    ['16:9'],
  ),
);
check('修改单图不会误生成整组三比例', () =>
  assert.deepEqual(
    imageSlots({ ...draft, parentAssetId: 'a1', editInstruction: '修改文字' }, config).map((s) => s.ratio),
    ['3:4'],
  ),
);
check('固定比例不能用错误比例素材冒充', () => {
  assert.equal(canReuseAsset({ width: 1600, height: 900 }, { key: '3:4', ratio: '3:4' }), false);
  assert.equal(canReuseAsset({ width: 750, height: 1000 }, { key: '3:4', ratio: '3:4' }), true);
  assert.equal(
    canReuseAsset({ width: 1600, height: 900 }, { key: 'paragraph-0', ratio: '4:3', allowAnyRatio: true }),
    true,
  );
});
console.log(`${passed} business checks passed`);
