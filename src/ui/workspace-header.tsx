import Link from 'next/link';
import { Button } from './components';

const navigation = [
  { title: '今天', href: '/' },
  { title: '消息', href: '/inbox' },
  { title: '作品', href: '/works' },
  { title: '创作', href: '/create' },
];
export function WorkspaceHeader({
  current,
  date,
  syncWindow,
  updatedLabel,
}: {
  current:
    | '/works'
    | '/create'
    | '/data-center'
    | '/'
    | '/topics'
    | '/images'
    | '/layouts'
    | '/publishing'
    | '/inbox'
    | '/deals';
  date: string;
  syncWindow: string;
  updatedLabel?: string;
}) {
  const section =
    current === '/deals'
      ? '/inbox'
      : current === '/data-center'
        ? '/works'
        : ['/topics', '/images', '/layouts', '/publishing'].includes(current)
          ? '/create'
          : current;
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
        {navigation.map((item) =>
          item.href ? (
            <Link
              key={item.title}
              href={item.href}
              className={`button nav-key ${section === item.href ? 'current' : ''}`}
              aria-current={section === item.href ? 'page' : undefined}
            >
              {item.title}
            </Link>
          ) : (
            <Button key={item.title} className="nav-key" disabled title="后续开发，暂未开放">
              {item.title}
            </Button>
          ),
        )}
      </nav>
      <div className="clock mono">
        <time dateTime={date}>
          {date} {weekday}
        </time>
        {updatedLabel ? <span>{updatedLabel}</span> : <Link href="/#data-health">查看更新状态 →</Link>}
      </div>
    </header>
  );
}
