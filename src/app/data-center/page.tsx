import { dashboardRead } from '@/ui/dashboard-read';
import { loadConfig } from '@/lib/config';
import { loadDataCenterConfig } from '@/lib/data-center-config';
import { usingDatabase } from '@/lib/media-store';
import { dataCenterData } from '@/lib/data-center-store';
import { shanghaiDate } from '@/browser/policy';
import { notFound } from 'next/navigation';
import DataCenterPage from './data-center-page';
export const dynamic = 'force-dynamic';
export const metadata = { title: '数据中心 · WILDMIND' };
export default async function Page({ searchParams }: { searchParams: Promise<{ post?: string }> }) {
  const [query, config, settings] = await Promise.all([searchParams, loadConfig(), loadDataCenterConfig()]);
  const all = await usingDatabase((db) => dataCenterData(db, config, settings));
  if (query.post && !all.posts.some((p) => p.id === query.post)) notFound();
  const data = query.post ? await usingDatabase((db) => dataCenterData(db, config, settings, query.post)) : all;
  return (
    <DataCenterPage
      key={data.selected?.id ?? 'empty'}
      data={data}
      readings={await usingDatabase((db) => dashboardRead(db, config).readings)}
      today={shanghaiDate()}
      syncWindow={config.parameters.syncWindow}
    />
  );
}
