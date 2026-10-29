import { replyDestinations } from '@/ui/reply-destinations';
import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadInboxConfig } from '@/lib/inbox-config';
import { readInbox } from '@/lib/workspace-service';
import { usingDatabase } from '@/lib/media-store';
import { withArchives } from '@/lib/record-archives';
import { contents, posts } from '@/db/schema';
import { resolveInboxWorkScope } from '@/ui/inbox-work-scope';
import InboxPage from './inbox-page';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '消息 · WILDMIND 野生脑洞工作台' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    message?: string;
    theme?: string;
    category?: string;
    channel?: string;
    reply?: string;
    content?: string;
    post?: string;
  }>;
}) {
  const [workspace, config, data] = await Promise.all([loadConfig(), loadInboxConfig(), readInbox()]);
  const query = await searchParams;
  const workScope =
    query.content || query.post
      ? await usingDatabase((db) => {
          const data = withArchives(db, { contents: db.db.select().from(contents).all() });
          return resolveInboxWorkScope(query, data.contents, db.db.select().from(posts).all());
        })
      : null;
  const scopedPriority = !!workScope && !query.message && !query.theme && !query.category && !query.reply;
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
      initialPriority={Object.keys(query).length === 0 || scopedPriority}
      initialWorkScope={workScope}
      initialThemeId={query.theme ?? null}
      initialFilters={{
        category: ['deal', 'idea', 'other'].includes(query.category ?? '') ? query.category! : 'all',
        channel: ['comment', 'dm'].includes(query.channel ?? '') ? query.channel! : workScope ? 'comment' : 'all',
        reply:
          query.reply === 'replied'
            ? 'archived'
            : ['waiting', 'archived', 'unknown'].includes(query.reply ?? '')
              ? query.reply!
              : 'all',
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
