import { loadConfig } from '@/lib/config';
import { loadDealConfig } from '@/lib/deal-config';
import { loadInboxConfig } from '@/lib/inbox-config';
import { readDashboard, readDeals } from '@/lib/workspace-service';
import Dashboard from './dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const [config, dealConfig, inbox, dealData] = await Promise.all([
    loadConfig(),
    loadDealConfig(),
    loadInboxConfig(),
    readDeals(),
  ]);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return (
    <Dashboard
      dealConfig={dealConfig}
      dealChannels={inbox.channels}
      initialDeals={dealData}
      config={config}
      today={today}
      initialData={await readDashboard()}
    />
  );
}
