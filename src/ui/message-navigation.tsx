import Link from 'next/link';
export function MessageNavigation({ current }: { current: 'inbox' | 'deals' }) {
  return (
    <nav className="group-navigation" aria-label="消息板块">
      <Link href="/inbox" aria-current={current === 'inbox' ? 'page' : undefined}>
        互动消息 →
      </Link>
      <Link href="/deals" aria-current={current === 'deals' ? 'page' : undefined}>
        商单 →
      </Link>
    </nav>
  );
}
