import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadTopicChannels } from '@/lib/topic-channels';
import { readTopics } from '@/lib/workspace-service';
import TopicsPage from './topics-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '选题中心 · WILDMIND 野生脑洞工作台' };
export default async function Page() {
  const [config, sources] = await Promise.all([loadConfig(), loadTopicChannels()]);
  return (
    <TopicsPage
      parameters={config.parameters}
      channels={sources.channels}
      channelDocument={sources.document}
      initialData={await readTopics()}
      today={new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())}
    />
  );
}
