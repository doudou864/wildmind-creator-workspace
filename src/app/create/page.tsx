import { redirect, notFound } from 'next/navigation';
import { usingDatabase } from '@/lib/media-store';
import { contents } from '@/db/schema';
import { isVisibleRecord } from '@/ui/visible-records';
import { CreationShell } from '@/ui/creation-shell';
import { loadConfig } from '@/lib/config';
import { shanghaiDate } from '@/browser/policy';
import Topics from '../topics/page';
import Images from '../images/page';
import Layouts from '../layouts/page';
import Publishing from '../publishing/page';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = Object.fromEntries(Object.entries(raw).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])));
  const rows = await usingDatabase((db) => db.db.select().from(contents).all());
  const old = rows.find((c) => c.id === query.content);
  const content = rows.find((c) => c.id === (old?.mergedInto ?? query.content)) ?? null;
  if (query.content && (!content || !isVisibleRecord(content))) notFound();
  const step = ['topic', 'materials', 'layout', 'publish'].includes(query.step)
    ? query.step
    : content
      ? 'materials'
      : 'topic';
  if (content) query.content = content.id;
  if (content?.form === '视频' && step === 'layout') {
    query.step = 'materials';
    redirect('/create?' + new URLSearchParams(query));
  }
  if (step === 'publish' && content) query.kind = content.form === '图文' ? 'layout' : 'video';
  const config = await loadConfig();
  const props = { searchParams: Promise.resolve(query) };
  return (
    <CreationShell
      content={content}
      step={step}
      query={new URLSearchParams(query).toString()}
      date={shanghaiDate()}
      syncWindow={config.parameters.syncWindow}
    >
      {step === 'topic' ? (
        <Topics />
      ) : step === 'materials' ? (
        <Images {...props} />
      ) : step === 'layout' ? (
        <Layouts {...props} />
      ) : (
        <Publishing {...props} />
      )}
    </CreationShell>
  );
}
