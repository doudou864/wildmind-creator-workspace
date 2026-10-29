import { redirect, notFound } from 'next/navigation';
import { usingDatabase } from '@/lib/media-store';
import { contents } from '@/db/schema';
import { isVisibleRecord } from '@/ui/visible-records';
import { legacyCreationDestination } from '@/ui/workspace-navigation';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const contentId = typeof query.content === 'string' ? query.content : undefined;
  const rows = await usingDatabase((db) => db.db.select().from(contents).all());
  const old = rows.find((c) => c.id === contentId);
  const content = rows.find((c) => c.id === (old?.mergedInto ?? contentId)) ?? null;
  if (contentId && (!content || !isVisibleRecord(content))) notFound();
  redirect(legacyCreationDestination(query, content));
}
