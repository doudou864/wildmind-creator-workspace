import Link from 'next/link';
import { ArchiveCenter } from './archive-controls';
import { workspaceNavigation, workspaceSection, type WorkspacePath } from './workspace-navigation';
export function WorkspaceHeader({
  current,
  date,
  syncWindow,
  updatedLabel,
}: {
  current: WorkspacePath;
  date: string;
  syncWindow: string;
  updatedLabel?: string;
}) {
  const section = workspaceSection(current);
  const weekday = new Date(`${date}T12:00:00+08:00`)
    .toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Shanghai' })
    .toUpperCase();
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="WILDMIND 野生脑洞工作台首页">
        <strong>WILDMIND</strong>
        <span>野生脑洞 · 工作台</span>
      </Link>
      <nav aria-label="工作台板块">
        {workspaceNavigation.map((item) => (
          <Link
            key={item.title}
            href={item.href}
            className={`button nav-key ${section === item.href ? 'current' : ''}`}
            aria-current={section === item.href ? 'page' : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      <ArchiveCenter />
      <div className="clock mono">
        <time dateTime={date}>
          {date} {weekday}
        </time>
        {updatedLabel ? <span>{updatedLabel}</span> : <Link href="/#data-health">查看更新状态 →</Link>}
      </div>
    </header>
  );
}
