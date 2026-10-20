import { replyDestinations } from '@/ui/reply-destinations';
import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadDealConfig } from '@/lib/deal-config';
import { loadInboxConfig } from '@/lib/inbox-config';
import { readDeals } from '@/lib/workspace-service';
import DealsPage from './deals-page';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '商单列表 · WILDMIND 野生脑洞工作台' };
export default async function Page({ searchParams }: { searchParams: Promise<{ deal?: string; status?: string }> }) {
  const [workspace, config, inbox, data, query] = await Promise.all([
    loadConfig(),
    loadDealConfig(),
    loadInboxConfig(),
    readDeals(),
    searchParams,
  ]);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const linkedId = typeof query.deal === 'string' ? query.deal : null,
    status = config.statuses.some((s) => s.id === query.status) ? query.status! : 'all';
  return (
    <DealsPage
      destinations={await replyDestinations()}
      key={`${linkedId ?? ''}-${status}`}
      config={config}
      channels={inbox.channels}
      platforms={workspace.platforms}
      initialData={data}
      initialId={linkedId}
      initialStatus={status}
      today={today}
      syncWindow={workspace.parameters.syncWindow}
    />
  );
}
