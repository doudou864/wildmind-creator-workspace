import { expect, test } from 'vitest';
import { imageRatioLabel, topicCoverDraft } from './image-topic-handoff';

test('选题只成为待发送文字，不继承其他对话或建立作品', () => {
  const topics = [{ id: 'chosen', title: '一个真实事件，为什么值得普通人关注？' }];
  const draft = topicCoverDraft('chosen', topics);
  expect(draft).toEqual({
    text: topics[0].title,
    topicId: 'chosen',
    topicTitle: topics[0].title,
    skillId: '',
    ratio: '',
  });
  draft.text = '用户自己修改后的提示词';
  expect(topics[0].title).toBe('一个真实事件，为什么值得普通人关注？');
});

test('失效或已归档选题不能被旧链接重新带入', () => {
  expect(() => topicCoverDraft('missing', [])).toThrow('失效或已归档');
  const topics = [{ id: 'archived', title: '历史内容', archivedAt: '2026-10-30' }];
  expect(() => topicCoverDraft('archived', topics)).toThrow('失效或已归档');
});

test('按配置比例展示取整图片，不把任意原图强行标成常用比例', () => {
  expect(imageRatioLabel(1672, 941, ['3:4', '16:9'], '1672:941')).toBe('16:9');
  expect(imageRatioLabel(750, 1000, ['3:4'], '3:4')).toBe('3:4');
  expect(imageRatioLabel(1000, 1000, ['3:4', '16:9'], '1:1')).toBe('1:1');
});
