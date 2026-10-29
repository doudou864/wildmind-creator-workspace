'use client';
import { ReplyDraft } from '@/ui/reply-draft';
import { MessageNavigation } from '@/ui/message-navigation';
import { inboxSummary } from '@/ui/inbox-summary';
import { groupInbox, inboxGroupKey } from '@/ui/inbox-groups';
import { ReplyActions, ReplyToast, type ReplyDestinations } from '@/ui/reply-actions';
import Link from 'next/link';
import { useState } from 'react';
import type { Platform } from '@/lib/config';
import {
  isMessageArchived,
  canSyncTopic,
  filterInbox,
  inboxTime,
  type InboxConfig,
  type InboxData,
  type InboxFilters,
  type InboxMessage,
} from '@/lib/inbox-model';
import { PageHeader, Button, Dialog, Empty, Segmented } from '@/ui/components';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { request, useResource } from '@/ui/use-resource';
const blankFilters: InboxFilters = {
  platform: 'all',
  channel: 'all',
  category: 'all',
  reply: 'all',
  classification: 'all',
  query: '',
  themeId: null,
};
const replyLabels = {
  waiting: '待回复',
  replied: '已回复',
  unknown: '待核对',
  low_value: '低价值',
  archived: '已归档',
};
const sourceLabels = { ready: '读取完成', pending: '等待读取', failed: '读取失败', unavailable: '当前无入口' };
export default function InboxPage({
  config,
  destinations,
  initialPriority = false,
  platforms,
  initialData,
  initialMessageId,
  initialThemeId = null,
  initialFilters = {},
  today,
  syncWindow,
}: {
  destinations: ReplyDestinations;
  initialPriority?: boolean;
  initialThemeId?: string | null;
  initialFilters?: Partial<InboxFilters>;
  initialMessageId: string | null;
  config: InboxConfig;
  platforms: Platform[];
  initialData: InboxData;
  today: string;
  syncWindow: string;
}) {
  const { data, error, refresh } = useResource('/api/inbox', initialData);
  const [priority, setPriority] = useState(initialPriority);
  const [filters, setFilters] = useState<InboxFilters>({
    ...blankFilters,
    ...initialFilters,
    reply: initialPriority ? 'waiting' : (initialFilters.reply ?? 'all'),
    themeId: initialThemeId,
  });
  const [linkedMessageId, setLinkedMessageId] = useState(initialMessageId);
  const initialMessage = initialData.items.find((m) => m.id === initialMessageId);
  const [selected, setSelected] = useState<{ key: string; title: string; platformId: string } | null>(
    initialMessage
      ? {
          key: inboxGroupKey(initialMessage),
          title: initialMessage.contentTitle ?? '关联消息',
          platformId: initialMessage.platformId,
        }
      : null,
  );
  const [busyId, setBusyId] = useState<string | null>(null),
    [refreshing, setRefreshing] = useState(false),
    [notice, setNotice] = useState('');
  const [syncReceipts, setSyncReceipts] = useState<Record<string, string>>({});
  const platformName = (id: string) => platforms.find((p) => p.id === id)?.name ?? id;
  const channelName = (id: string) => config.channels.find((c) => c.id === id)?.name ?? id;
  const allPlatforms = [
    ...platforms.map((p) => ({ id: p.id, name: p.name })),
    ...Array.from(new Set(data.items.map((m) => m.platformId)))
      .filter((id) => !platforms.some((p) => p.id === id))
      .map((id) => ({ id, name: platformName(id) })),
  ];
  const summary = inboxSummary(data.items);
  const valuableIds = new Set(summary.valuable.map((m) => m.id));
  const filtered = filterInbox(data.items, data.themes, filters).filter(
    (m) =>
      (filters.reply === 'archived' ? isMessageArchived(m) : !isMessageArchived(m)) &&
      (!linkedMessageId || m.id === linkedMessageId) &&
      (!priority || valuableIds.has(m.id)),
  );
  const groups = groupInbox(filtered, data.items);
  const selectedGroup = groups.find((g) => g.key === selected?.key);
  function filter(patch: Partial<InboxFilters>) {
    setLinkedMessageId(null);
    setSelected(null);
    setFilters((current) => ({ ...current, ...patch }));
  }
  async function reload() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }
  async function syncTopic(item: InboxMessage) {
    if (!data.topicSyncReady || busyId || !canSyncTopic(item) || syncReceipts[item.id]) return;
    setBusyId(item.id);
    setNotice('');
    try {
      const result = await request<{ item: InboxMessage }>(`/api/inbox/${encodeURIComponent(item.id)}/topic`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: item.revision }),
      });
      if (result.item?.id !== item.id || !result.item.topicSignalId) throw Error('同步结果未确认，请刷新后核对。');
      setSyncReceipts((current) => ({ ...current, [item.id]: result.item.topicSignalId! }));
      setNotice('已送进选题');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '同步失败');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }
  return (
    <main className="workspace inbox-workspace">
      <WorkspaceHeader current="/inbox" date={today} syncWindow={syncWindow} />
      <MessageNavigation current="inbox" />
      <ReplyToast />
      <PageHeader
        title="消息"
        summary="按平台选作品，集中处理值得回复的评论"
        onRefresh={() => void reload()}
        refreshing={refreshing}
        action={
          <Button
            variant="primary"
            disabled={!groups.length}
            disabledReason="当前没有符合条件的消息"
            onClick={() => setSelected(groups[0] ?? null)}
          >
            开始处理
          </Button>
        }
      />
      <details className="card inbox-sources">
        <summary>
          {data.sources.length} 个来源 · {data.sources.filter((s) => s.status === 'ready').length} 个已读取
          {data.sources.some((s) => s.status === 'failed') &&
            ` · ${data.sources.filter((s) => s.status === 'failed').length} 个读取失败`}
          {data.sources.some((s) => s.status === 'unavailable') ? ' · 部分来源暂无入口' : ''}
        </summary>
        {data.sources.length ? (
          <div className="inbox-source-grid">
            {data.sources.map((source) => (
              <div
                key={`${source.platformId}-${source.channel}`}
                className={source.status === 'failed' ? 'inbox-source-failed' : ''}
              >
                <strong>
                  {platformName(source.platformId)} · {channelName(source.channel)}
                </strong>
                <span>{sourceLabels[source.status]}</span>
                <time className="mono" dateTime={source.capturedAt ?? undefined}>
                  {inboxTime(source.capturedAt)}
                </time>
                {source.reason && (source.status === 'failed' || source.status === 'unavailable') && (
                  <p>
                    {source.status === 'failed' ? '这次没能完整读取，请到平台查看。' : '平台当前没有开放这个消息入口。'}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty>尚无评论或私信读取记录</Empty>
        )}
      </details>
      <details
        className="inbox-filter-disclosure"
        open={
          filters.platform !== 'all' ||
          filters.channel !== 'all' ||
          !!filters.query ||
          filters.classification !== 'all' ||
          filters.reply === 'archived' ||
          filters.reply === 'unknown'
        }
      >
        <summary>
          筛选{filters.platform !== 'all' ? ` · ${platformName(filters.platform)}` : ''}
          {filters.channel !== 'all' ? ` · ${channelName(filters.channel)}` : ''}
          {!priority && filters.reply !== 'all' ? ` · ${replyLabels[filters.reply as keyof typeof replyLabels]}` : ''}
          {filters.classification !== 'all' ? ' · 已选识别状态' : ''}
          {filters.query ? ` · ${filters.query}` : ''}
        </summary>
        <div className="inbox-filters">
          <label>
            消息范围
            <select
              aria-label="消息范围"
              value={priority ? 'valuable' : 'all'}
              onChange={(e) => {
                setPriority(e.target.value === 'valuable');
                setLinkedMessageId(null);
                setSelected(null);
              }}
            >
              <option value="valuable">有价值消息</option>
              <option value="all">全部消息</option>
            </select>
          </label>
          {data.themes.length > 0 && (
            <label>
              需求主题
              <select
                aria-label="需求主题"
                value={filters.themeId ?? ''}
                onChange={(e) => filter({ themeId: e.target.value || null })}
              >
                <option value="">全部主题</option>
                {data.themes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            分类
            <select
              aria-label="筛选分类"
              value={filters.category}
              onChange={(e) => filter({ category: e.target.value })}
            >
              <option value="all">全部分类</option>
              {config.categories.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.id === 'idea' ? '问题与观点' : c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            平台
            <select
              aria-label="筛选平台"
              value={filters.platform}
              onChange={(e) => filter({ platform: e.target.value })}
            >
              <option value="all">全部平台</option>
              {allPlatforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <Segmented
            label="消息类型"
            value={filters.channel}
            options={[
              { value: 'all', label: '全部类型' },
              ...config.channels.map((c) => ({ value: c.id, label: c.name })),
            ]}
            onChange={(channel) => filter({ channel })}
          />
          <label>
            回复状态
            <select aria-label="筛选回复状态" value={filters.reply} onChange={(e) => filter({ reply: e.target.value })}>
              <option value="all">全部回复状态</option>
              <option value="waiting">待回复</option>
              <option value="archived">已归档</option>
              <option value="unknown">待核对</option>
            </select>
          </label>
          <label>
            识别状态
            <select
              aria-label="筛选识别状态"
              value={filters.classification}
              onChange={(e) => filter({ classification: e.target.value })}
            >
              <option value="all">全部识别状态</option>
              <option value="ready">已识别</option>
              <option value="pending">待识别</option>
              <option value="failed">识别失败</option>
            </select>
          </label>
          <label className="inbox-search">
            搜索
            <input
              type="search"
              aria-label="搜索消息"
              value={filters.query}
              onChange={(e) => filter({ query: e.target.value })}
              placeholder="发送者、消息原文、关联作品"
            />
          </label>
          <Button onClick={() => filter(blankFilters)}>重置筛选</Button>
        </div>
      </details>

      {linkedMessageId && (
        <div className="deal-linked">
          <span>正在查看关联消息</span>
          <Button
            onClick={() => {
              setLinkedMessageId(null);
              setSelected(null);
            }}
          >
            查看全部消息
          </Button>
        </div>
      )}
      {notice && !selected && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="inbox-platform-sections">
        {allPlatforms.map((platform) => {
          const works = groups.filter((g) => g.platformId === platform.id);
          if (!works.length) return null;
          return (
            <section className="inbox-platform-section" key={platform.id} aria-label={platform.name}>
              <h2>{platform.name}</h2>
              <div className="inbox-work-cards">
                {works.map((group) => (
                  <button
                    type="button"
                    className="inbox-work-card"
                    key={group.key}
                    aria-haspopup="dialog"
                    onClick={() => {
                      setSelected(group);
                      setNotice('');
                    }}
                  >
                    <strong>{group.title}</strong>
                    <span className="inbox-work-count">
                      {filters.reply === 'waiting' ? (
                        <>
                          <b className="mono">{group.waiting}</b>{' '}
                          {group.channel === 'dm' ? '个会话待回复' : '条评论待回复'}
                        </>
                      ) : (
                        <>
                          <b className="mono">{group.items.length}</b> 条
                          {filters.reply === 'archived' ? '已归档消息' : '消息'}
                        </>
                      )}
                    </span>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
        {!groups.length && (
          <Empty>{data.recordsReady ? '当前没有符合条件的消息' : '尚未读取消息，完成读取后出现'}</Empty>
        )}
      </div>
      {selected && (
        <Dialog className="inbox-comments-drawer" title={selected.title} onClose={() => setSelected(null)}>
          <p className="inbox-drawer-summary">
            {platformName(selected.platformId)} · {selectedGroup?.items.length ?? 0} 条{priority ? '有价值' : ''}
            {selectedGroup?.channel === 'dm' ? '私信' : '评论'}
          </p>
          {notice && <p role="status">{notice}</p>}
          <div className="inbox-comment-stack">
            {selectedGroup?.items.map((item) => {
              const state = summary.assessments.get(item.id)?.state ?? 'unknown';
              const category = item.classification.status === 'ready' ? item.classification.result.category : null;
              const signalId = item.topicSignalId ?? syncReceipts[item.id];
              return (
                <article className="inbox-comment" key={item.id}>
                  <header>
                    <strong className="inbox-account">
                      {item.author.startsWith('@') ? item.author : `@${item.author || '发送者未识别'}`}
                    </strong>
                    <time className="mono">{inboxTime(item.sentAt)}</time>
                    <span>{item.newReply ? '有新消息' : replyLabels[state]}</span>
                  </header>
                  <p className="inbox-comment-body">{item.body || '原文未读取完整'}</p>
                  <ReplyActions message={item} destinations={destinations} />
                  <div className="inbox-comment-tools">
                    {(category === 'idea' || category === 'deal') && <ReplyDraft id={item.id} />}
                    {category === 'idea' &&
                      (signalId ? (
                        <Link href="/topics">已送进选题 →</Link>
                      ) : (
                        <Button
                          disabled={!data.topicSyncReady || !!busyId}
                          disabledReason={!data.topicSyncReady ? '选题同步暂不可用' : '正在同步'}
                          onClick={() => void syncTopic(item)}
                        >
                          {busyId === item.id ? '正在同步…' : '送进选题'}
                        </Button>
                      ))}
                    {category === 'deal' && (
                      <Link href={item.dealId ? `/deals?deal=${encodeURIComponent(item.dealId)}` : '/deals'}>
                        看商单 →
                      </Link>
                    )}
                  </div>
                  {!!item.context.length && (
                    <details className="inbox-context">
                      <summary>查看上下文</summary>
                      {item.context.map((entry) => (
                        <div className="inbox-context-entry" key={entry.id}>
                          <strong className="inbox-account">
                            {entry.sender === 'self' ? '我方' : entry.author || '发送者未识别'}
                          </strong>
                          <p>{entry.body}</p>
                        </div>
                      ))}
                    </details>
                  )}
                </article>
              );
            })}
          </div>
          {!selectedGroup?.items.length && <Empty>这组消息已处理完，可关闭继续查看其他作品</Empty>}
        </Dialog>
      )}
    </main>
  );
}
