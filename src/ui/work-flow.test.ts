import { describe, expect, it } from 'vitest';
import { uniqueVideoId, resumableLayout } from './work-flow';
import { createLayout } from '../lib/layout-model';
describe('作品交接不误选材料', () => {
  it('自动带出唯一成片，但同作品多个剪辑不能猜哪版正确', () => {
    const videos = [
      { id: 'a1', contentId: 'a' },
      { id: 'b1', contentId: 'b' },
    ];
    expect(uniqueVideoId(videos, 'a')).toBe('a1');
    expect(uniqueVideoId([...videos, { id: 'a2', contentId: 'a' }], 'a')).toBeNull();
    expect(uniqueVideoId(videos, null)).toBeNull();
  });
  it('继续最近未确认稿，不能串到其他作品或把全部已送出的稿当待编辑', () => {
    const old = { ...createLayout('标题\n正文', 'a'), id: 'old', updatedAt: '2026-10-18T00:00:00Z' };
    const recent = { ...createLayout('新标题\n正文', 'a'), id: 'recent', updatedAt: '2026-10-19T00:00:00Z' };
    const other = { ...createLayout('其他\n正文', 'b'), id: 'other', updatedAt: '2026-10-20T00:00:00Z' };
    expect(resumableLayout([old, recent, other], 'a')?.id).toBe('recent');
    for (const v of Object.values(recent.variants)) v.status = 'sent';
    expect(resumableLayout([old, recent, other], 'a')?.id).toBe('old');
    expect(resumableLayout([recent], 'a')).toBeNull();
  });
});
