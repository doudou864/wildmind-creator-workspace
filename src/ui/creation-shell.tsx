'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { WorkspaceHeader } from './workspace-header';
import { workTitle } from './data-freshness';
export const creationPaths: Record<string, string> = {
  '/topics': 'topic',
  '/images': 'materials',
  '/layouts': 'layout',
  '/publishing': 'publish',
};
export function CreationShell({
  children,
  content,
  step,
  query,
  date,
  syncWindow,
}: {
  children: ReactNode;
  content: { id: string; title: string; form: string } | null;
  step: string;
  query: string;
  date: string;
  syncWindow: string;
}) {
  const router = useRouter();
  const steps = [
    { id: 'topic', label: '选题' },
    { id: 'materials', label: '素材' },
    ...(content?.form === '视频' ? [] : [{ id: 'layout', label: '排版' }]),
    { id: 'publish', label: '发布检查' },
  ];
  function href(next: string) {
    const p = new URLSearchParams(query);
    p.set('step', next);
    if (content) p.set('content', content.id);
    return '/create?' + p.toString();
  }
  if (step === 'materials') return <>{children}</>;
  return (
    <div
      className="workspace creation-shell"
      onClickCapture={(e) => {
        const a = (e.target as Element).closest('a');
        if (!a || a.target || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
        const u = new URL(a.href, location.href);
        const next = creationPaths[u.pathname];
        if (u.origin !== location.origin || !next) return;
        if (next === 'layout' && content?.form === '视频') return;
        e.preventDefault();
        const p = new URLSearchParams(u.search);
        p.set('step', next);
        if (content && !p.has('content')) p.set('content', content.id);
        router.push('/create?' + p.toString());
      }}
    >
      <WorkspaceHeader current="/create" date={date} syncWindow={syncWindow} />
      <div className="creation-current">
        <strong>{content ? workTitle(content.title) : '还没有关联作品'}</strong>
        <span>{content?.form ?? '选好方向后，在素材步骤建立作品'}</span>
        {content && <Link href={`/works?content=${content.id}`}>查看作品 →</Link>}
      </div>
      <nav className="creation-stage-tabs" aria-label="创作步骤">
        {steps.map((s) => (
          <Link key={s.id} href={href(s.id)} aria-current={step === s.id ? 'step' : undefined}>
            {s.label}
          </Link>
        ))}
      </nav>
      <div className="creation-stage">{children}</div>
    </div>
  );
}
