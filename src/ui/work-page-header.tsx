'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from './components';
export function WorkPageHeader({ hasWorks }: { hasWorks: boolean }) {
  const router = useRouter();
  return (
    <PageHeader
      title="作品数据"
      summary={hasWorks ? '展开一条作品，看表现或继续制作' : '先选一个方向，开始创作'}
      onRefresh={() => router.refresh()}
      action={
        <Link className="button button-primary" href="/topics">
          去选题 →
        </Link>
      }
    />
  );
}
