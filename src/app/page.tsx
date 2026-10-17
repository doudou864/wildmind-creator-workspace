import { loadConfig } from '@/lib/config';
import { readDashboard } from '@/lib/workspace-service';
import Dashboard from './dashboard';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const config = await loadConfig();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return <Dashboard config={config} today={today} initialData={await readDashboard()} />;
}
