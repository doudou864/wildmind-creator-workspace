import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { readTopics } from '@/lib/workspace-service';
import TopicsPage from './topics-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: '选题 · WILDMIND 野生脑洞工作台' };
export default async function Page() {
  const config = await loadConfig();
  return (
    <TopicsPage
      parameters={config.parameters}
      platforms={config.platforms}
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
