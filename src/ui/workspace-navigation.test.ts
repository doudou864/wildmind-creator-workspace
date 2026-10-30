import { describe, expect, it } from 'vitest';
import { legacyCreationDestination, workspaceNavigation, workspaceSection } from './workspace-navigation';

describe('video workflow navigation', () => {
  it('makes each video task directly reachable and independently selected', () => {
    expect(workspaceNavigation.map((item) => item.title)).toEqual([
      '总控台',
      '作品数据',
      '选题',
      '封面生成',
      '一键发布',
    ]);
    for (const item of workspaceNavigation) expect(workspaceSection(item.href)).toBe(item.href);
    expect(workspaceNavigation.some((item) => String(item.href) === '/layouts')).toBe(false);
  });

  it('keeps legacy analysis and deal pages in their owning sections', () => {
    expect(workspaceSection('/data-center')).toBe('/works');
    expect(workspaceSection('/deals')).toBe('/');
  });
});

describe('legacy creation links', () => {
  it.each([
    ['topic', '/topics'],
    ['materials', '/images'],
    ['layout', '/layouts'],
    ['publish', '/publishing'],
  ])('opens the independent %s page without returning to the creation shell', (step, pathname) => {
    const url = new URL(
      legacyCreationDestination({ step, topic: '测试 & 选题', view: ['a', 'b'] }, null),
      'http://local',
    );
    expect(url.pathname).toBe(pathname);
    expect(url.searchParams.has('step')).toBe(false);
    expect(url.searchParams.get('topic')).toBe('测试 & 选题');
    expect(url.searchParams.getAll('view')).toEqual(['a', 'b']);
  });

  it('starts new work at topics and resumes existing work at covers', () => {
    expect(legacyCreationDestination({}, null)).toBe('/topics');
    expect(legacyCreationDestination({ step: 'unknown' }, null)).toBe('/topics');
    expect(legacyCreationDestination({}, { id: 'video', form: '视频' })).toBe('/images?content=video');
  });

  it('keeps video works out of the legacy article editor', () => {
    expect(legacyCreationDestination({ step: 'layout' }, { id: 'video', form: '视频' })).toBe('/images?content=video');
  });

  it('preserves article publishing and replaces merged content ids without converting the draft to video', () => {
    const url = new URL(
      legacyCreationDestination(
        { step: 'publish', content: 'old', kind: 'video', batch: 'existing-draft' },
        { id: 'merged', form: '图文' },
      ),
      'http://local',
    );
    expect(url.pathname).toBe('/publishing');
    expect(url.searchParams.get('kind')).toBe('layout');
    expect(url.searchParams.get('content')).toBe('merged');
    expect(url.searchParams.get('batch')).toBe('existing-draft');
  });

  it('retains an explicitly linked legacy publishing mode when no work is associated', () => {
    expect(legacyCreationDestination({ step: 'publish', kind: 'xhs' }, null)).toBe('/publishing?kind=xhs');
  });
});
