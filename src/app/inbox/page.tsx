import { replyDestinations } from '@/ui/reply-destinations';
import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadInboxConfig } from '@/lib/inbox-config';
import { readInbox } from '@/lib/workspace-service';
import InboxPage from './inbox-page';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '互动收件箱 · WILDMIND 野生脑洞工作台' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; theme?: string; category?: string; channel?: string; reply?: string }>;
}) {
  const [workspace, config, data] = await Promise.all([loadConfig(), loadInboxConfig(), readInbox()]);
  const query = await searchParams;
  const messageId = typeof query.message === 'string' ? query.message : null;
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return (
    <InboxPage
      destinations={await replyDestinations()}
      initialPriority={Object.keys(query).length === 0}
      initialThemeId={query.theme ?? null}
      initialFilters={{
        category: ['deal', 'idea', 'other'].includes(query.category ?? '') ? query.category! : 'all',
        channel: ['comment', 'dm'].includes(query.channel ?? '') ? query.channel! : 'all',
        reply: ['waiting', 'replied', 'unknown'].includes(query.reply ?? '') ? query.reply! : 'all',
      }}
      key={JSON.stringify(query)}
      initialMessageId={messageId}
      config={config}
      platforms={workspace.platforms}
      initialData={data}
      today={today}
      syncWindow={workspace.parameters.syncWindow}
    />
  );
}
