import Link from 'next/link';
import { Button } from './components';

const navigation = [
  { title: '总控台', href: '/' },
  { title: '数据中心', href: '/data-center' },
  { title: '选题中心', href: '/topics' },
  { title: '生图中心', href: '/images' },
  { title: '排版中心', href: '/layouts' },
  { title: '发布中心', href: '/publishing' },
  { title: '互动收件箱', href: '/inbox' },
  { title: '商单列表', href: '/deals' },
];
export function WorkspaceHeader({
  current,
  date,
  syncWindow,
}: {
  current: '/data-center' | '/' | '/topics' | '/images' | '/layouts' | '/publishing' | '/inbox' | '/deals';
  date: string;
  syncWindow: string;
}) {
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
              className={`button nav-key ${current === item.href ? 'current' : ''}`}
              aria-current={current === item.href ? 'page' : undefined}
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
        <span>SYNC {syncWindow}</span>
      </div>
    </header>
  );
}
