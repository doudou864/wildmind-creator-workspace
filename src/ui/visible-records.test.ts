import { describe, expect, it } from 'vitest';
import { isVisibleRecord, visibleRecords } from './visible-records';

describe('normal-page read projection', () => {
  it('hides named test records and explicit fixtures, but not ordinary message bodies', () => {
    expect(isVisibleRecord({ title: '验收草稿·茶杯与柠檬（不发布）' })).toBe(false);
    expect(isVisibleRecord({ name: '测试成片' })).toBe(false);
    expect(isVisibleRecord({ title: '普通作品', fixture: true })).toBe(false);
    expect(isVisibleRecord({ title: '普通作品', tags: ['fixture'] })).toBe(false);
    expect(isVisibleRecord({ author: '观众', text: '请测试一下这个功能' })).toBe(true);
    expect(isVisibleRecord({ variants: {}, source: '真实文章\n正文讨论测试方法' })).toBe(true);
  });
  it('also hides linked publishing history and receipts without deleting or rewriting source records', () => {
    const source = {
      contents: [
        { id: 'test', title: '验收作品' },
        { id: 'real', title: '真实作品' },
      ],
      batches: [
        { id: 'a', draft: { contentId: 'test' } },
        { id: 'b', draft: { contentId: 'real' } },
      ],
      receipts: [
        { id: 'ra', batchId: 'a' },
        { id: 'rb', batchId: 'b' },
      ],
      hitRates: [{ completed: 12, hits: 3 }],
    };
    const original = structuredClone(source);
    const view = visibleRecords(source);
    expect(view.contents.map((r) => r.id)).toEqual(['real']);
    expect(view.batches.map((r) => r.id)).toEqual(['b']);
    expect(view.receipts.map((r) => r.id)).toEqual(['rb']);
    expect(view.hitRates).toBe(source.hitRates);
    expect(source).toEqual(original);
  });
  it('filters dashboard works and detail selections without altering baselines or comparison results', () => {
    const test = { id: 'test', title: '测试作品' };
    const data = {
      platforms: { douyin: { works: [test, { id: 'real', title: '作品' }], baselines: { video: 30 } } },
      selected: test,
      comparisons: { '3': [4, 5] },
    };
    const view = visibleRecords(data);
    expect(view.platforms.douyin.works).toHaveLength(1);
    expect(view.selected).toBeNull();
    expect(view.platforms.douyin.baselines).toBe(data.platforms.douyin.baselines);
    expect(view.comparisons).toBe(data.comparisons);
  });
});
