export const workspaceNavigation = [
  { title: '总控台', href: '/' },
  { title: '消息', href: '/inbox' },
  { title: '作品数据', href: '/works' },
  { title: '选题', href: '/topics' },
  { title: '封面生成', href: '/images' },
  { title: '一键发布', href: '/publishing' },
] as const;

export type WorkspacePath =
  (typeof workspaceNavigation)[number]['href'] | '/create' | '/data-center' | '/layouts' | '/deals';

export function workspaceSection(current: WorkspacePath): WorkspacePath {
  if (current === '/deals') return '/inbox';
  if (current === '/data-center') return '/works';
  if (current === '/create') return '/topics';
  return current;
}

export function legacyCreationDestination(
  query: Record<string, string | string[] | undefined>,
  content: { id: string; form: string } | null,
): string {
  const paths: Record<string, string> = {
    topic: '/topics',
    materials: '/images',
    layout: '/layouts',
    publish: '/publishing',
  };
  let step =
    typeof query.step === 'string' && Object.hasOwn(paths, query.step) ? query.step : content ? 'materials' : 'topic';
  if (content?.form === '视频' && step === 'layout') step = 'materials';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'step') continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  }
  if (content) params.set('content', content.id);
  if (step === 'publish' && content) params.set('kind', content.form === '图文' ? 'layout' : 'video');
  return `${paths[step]}${params.size ? `?${params}` : ''}`;
}
