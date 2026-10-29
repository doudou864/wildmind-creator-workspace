import { loadBrowserConfig } from '@/browser/config';
import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadPublishingConfig } from '@/lib/publishing-config';
import { loadLayoutConfig } from '@/lib/layout-config';
import { readPublishing } from '@/lib/workspace-service';
import PublishingPage from './publishing-page';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '一键发布 · WILDMIND 野生脑洞工作台' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ content?: string; kind?: string; asset?: string; topic?: string; batch?: string }>;
}) {
  const query = await searchParams;
  const workspace = await loadConfig();
  const [config, layoutConfig, data] = await Promise.all([
    loadPublishingConfig(workspace.platforms),
    loadLayoutConfig(),
    readPublishing(),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return (
    <PublishingPage
      key={`${query.content ?? ''}:${query.kind ?? ''}:${query.asset ?? ''}:${query.topic ?? ''}:${query.batch ?? ''}`}
      initialContent={query.content ?? null}
      initialKind={query.kind === 'layout' || query.kind === 'xhs' ? query.kind : 'video'}
      initialAsset={query.asset ?? null}
      initialTopic={query.topic ?? null}
      initialBatchId={query.batch ?? null}
      managementPages={Object.fromEntries((await loadBrowserConfig()).map((p) => [p.id, p.managementPage ?? p.url]))}
      config={config}
      layoutConfig={layoutConfig}
      platforms={workspace.platforms}
      initialData={data}
      today={today}
      syncWindow={workspace.parameters.syncWindow}
      expiryHours={workspace.parameters.publishUploadExpiryHours}
    />
  );
}
