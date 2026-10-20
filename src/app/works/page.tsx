import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadConfig } from '@/lib/config';
import { loadDataCenterConfig } from '@/lib/data-center-config';
import { usingDatabase } from '@/lib/media-store';
import { contents, posts, postSnapshots } from '@/db/schema';
import { dataCenterData } from '@/lib/data-center-store';
import { analysisRead } from '@/ui/analysis-read';
import { dashboardRead } from '@/ui/dashboard-read';
import { isVisibleRecord } from '@/ui/visible-records';
import { workTitle } from '@/ui/data-freshness';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { WorkPageHeader } from '@/ui/work-page-header';
import { shanghaiDate } from '@/browser/policy';
import DataCenterPage from '../data-center/data-center-page';
export const dynamic = 'force-dynamic';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [query, config, settings] = await Promise.all([searchParams, loadConfig(), loadDataCenterConfig()]);
  const all = await usingDatabase((db) => ({
    contents: db.db.select().from(contents).all(),
    posts: db.db.select().from(posts).all(),
    samples: db.db.select().from(postSnapshots).all(),
  }));
  const items = all.contents.filter(isVisibleRecord).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const requested = typeof query.content === 'string' ? all.contents.find((c) => c.id === query.content) : undefined;
  const requestedId = requested?.mergedInto ?? requested?.id;
  const requestedPost = typeof query.post === 'string' ? all.posts.find((p) => p.id === query.post) : undefined;
  if (query.post && !requestedPost) notFound();
  const selected =
    items.find((c) => c.id === (requestedId ?? requestedPost?.contentId)) ??
    (!query.content && !query.post ? items[0] : undefined);
  if ((query.content || query.post) && !selected) notFound();
  const published = selected ? all.posts.filter((p) => p.contentId === selected.id) : [];
  const post =
    published.find((p) => p.id === query.post) ??
    published.find((p) => p.platformId === settings.platformId) ??
    published[0];
  const detail =
    post?.platformId === settings.platformId
      ? await usingDatabase((db) => ({
          data: dataCenterData(db, config, settings, post.id),
          raw: analysisRead(db, post.id, config.metrics),
          readings: dashboardRead(db, config).readings,
        }))
      : null;
  const latest = post
    ? all.samples.filter((s) => s.postId === post.id).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0]
        ?.capturedAt
    : null;
  return (
    <main className="workspace works-workspace">
      <WorkspaceHeader current="/works" date={shanghaiDate()} syncWindow={config.parameters.syncWindow} />
      <WorkPageHeader hasWorks={items.length > 0} />
      <div className="works-grid">
        <section className="card works-list">
          <h2>作品</h2>
          {items.map((c) => {
            const platforms = all.posts.filter((p) => p.contentId === c.id);
            return (
              <Link
                className={`list-row work-entry ${selected?.id === c.id ? 'active' : ''}`}
                key={c.id}
                href={`/works?content=${c.id}`}
              >
                <strong>{workTitle(c.title)}</strong>
                <small>
                  {c.form} ·{' '}
                  {platforms.length
                    ? platforms
                        .map((p) => config.platforms.find((x) => x.id === p.platformId)?.name ?? p.platformId)
                        .join(' / ')
                    : '未发布'}
                </small>
                <span>{platforms.length ? '看表现' : '继续创作'} →</span>
              </Link>
            );
          })}
        </section>
        <section className="works-detail">
          {selected ? (
            <>
              <nav className="group-navigation" aria-label="作品平台">
                {published.map((p) => (
                  <Link
                    key={p.id}
                    aria-current={post?.id === p.id ? 'page' : undefined}
                    href={`/works?content=${selected.id}&post=${p.id}`}
                  >
                    {config.platforms.find((x) => x.id === p.platformId)?.name ?? p.platformId} →
                  </Link>
                ))}
              </nav>
              {!published.length ? (
                <section className="card">
                  <h2>{workTitle(selected.title)}</h2>
                  <Link className="button" href={`/create?content=${selected.id}&step=materials`}>
                    继续创作 →
                  </Link>
                </section>
              ) : detail ? (
                <DataCenterPage
                  key={post.id}
                  embedded
                  data={detail.data}
                  rawReadings={detail.raw}
                  readings={detail.readings}
                  metricPresentation={settings.presentation}
                  today={shanghaiDate()}
                  syncWindow={config.parameters.syncWindow}
                />
              ) : (
                <section className="card">
                  <h2>{workTitle(selected.title)}</h2>
                  <p>
                    发布于 {post?.publishedAt} · 最近采集 {latest ?? '暂无'}
                  </p>
                  <p className="small">本平台先看已采集数值，同龄比较尚未开放。</p>
                  <dl className="work-platform-values">
                    {all.samples
                      .filter((s) => s.postId === post?.id && s.capturedAt === latest)
                      .map((s) => {
                        const m = config.metrics.find((m) => m.id === s.metricId);
                        return (
                          <div key={s.id}>
                            <dt>{m?.name ?? s.metricId}</dt>
                            <dd>
                              {s.precision === 'display' ? '约 ' : ''}
                              {s.value?.toLocaleString('en-US') ?? '—'}
                              {s.value == null ? '' : m?.unit}
                            </dd>
                          </div>
                        );
                      })}
                  </dl>
                </section>
              )}
            </>
          ) : (
            <p className="card collapsed-note">还没有作品，选题后开始制作。</p>
          )}
        </section>
      </div>
    </main>
  );
}
