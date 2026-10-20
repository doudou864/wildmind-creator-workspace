'use client';
import { MessageNavigation } from '@/ui/message-navigation';
import { inboxSummary } from '@/ui/inbox-summary';
import { ReplyActions, type ReplyDestinations } from '@/ui/reply-actions';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Platform } from '@/lib/config';
import {
  canSyncTopic,
  filterInbox,
  inboxPage,
  inboxTime,
  themeMessages,
  waitingCount,
  type InboxConfig,
  type InboxData,
  type InboxFilters,
  type InboxMessage,
} from '@/lib/inbox-model';
import { PageHeader, Button, Card, Empty, Segmented } from '@/ui/components';
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
const replyLabels = { waiting: '待回复', replied: '已回复', unknown: '待核对' };
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
  const [special, setSpecial] = useState<'all' | 'topics' | 'unclassified'>('all');
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [filters, setFilters] = useState<InboxFilters>({
    ...blankFilters,
    ...initialFilters,
    reply: initialPriority ? 'waiting' : (initialFilters.reply ?? 'all'),
    themeId: initialThemeId,
  });
  const [linkedMessageId, setLinkedMessageId] = useState(initialMessageId);
  const [requestedPage, setRequestedPage] = useState(1),
    [selectedId, setSelectedId] = useState<string | null>(initialMessageId);
  const [busyId, setBusyId] = useState<string | null>(null),
    [refreshing, setRefreshing] = useState(false),
    [notice, setNotice] = useState('');
  const [syncReceipts, setSyncReceipts] = useState<Record<string, string>>({});
  const platformName = (id: string) => platforms.find((p) => p.id === id)?.name ?? `${id}（历史平台）`;
  const channelName = (id: string) => config.channels.find((c) => c.id === id)?.name ?? id;
  function messageCategory(item: InboxMessage) {
    const classification = item.classification;
    return classification.status === 'ready'
      ? classification.result.category === 'idea'
        ? '问题与观点'
        : (config.categories.find((c) => c.id === classification.result.category)?.name ?? '分类不可用')
      : classification.status === 'pending'
        ? '待识别'
        : '识别失败';
  }
  const allPlatforms = [
    ...platforms.map((p) => ({ id: p.id, name: p.name })),
    ...Array.from(new Set(data.items.map((item) => item.platformId)))
      .filter((id) => !platforms.some((p) => p.id === id))
      .map((id) => ({ id, name: platformName(id) })),
  ];
  const scoped = filterInbox(data.items, data.themes, {
    ...blankFilters,
    platform: filters.platform,
    channel: filters.channel,
  });
  const visibleThemes = data.themes.filter(
    (t) => themeMessages(t, scoped).length > 0 || (filters.platform === 'all' && filters.channel === 'all'),
  );
  const summary = inboxSummary(data.items);
  const valuableIds = new Set(summary.valuable.map((m) => m.id));
  const filtered = filterInbox(data.items, data.themes, filters)
    .filter(
      (item) =>
        (!linkedMessageId || item.id === linkedMessageId) &&
        (!priority || valuableIds.has(item.id)) &&
        (special !== 'topics' || (canSyncTopic(item) && !syncReceipts[item.id])) &&
        (special !== 'unclassified' || item.classification.status !== 'ready'),
    )
    .sort((a, b) => {
      const rank = (m: InboxMessage) =>
        m.classification.status === 'ready' ? { deal: 0, idea: 1, other: 2 }[m.classification.result.category] : 3;
      return rank(a) - rank(b);
    });
  const page = inboxPage(filtered, requestedPage, config.pageSize);
  const active = page.items.find((item) => item.id === selectedId) ?? page.items[0] ?? null;
  const assessments = summary.assessments;
  const assessment = active ? assessments.get(active.id) : null;
  const theme = filters.themeId ? data.themes.find((t) => t.id === filters.themeId) : null;
  const displayCount = (value: number) => (data.recordsReady ? value.toLocaleString('en-US') : '--');
  const unclassified = data.items.filter((item) => item.classification.status !== 'ready').length;
  const topics = data.items.filter(
    (item) =>
      item.classification.status === 'ready' &&
      item.classification.result.category === 'idea' &&
      !item.topicSignalId &&
      !syncReceipts[item.id],
  ).length;
  useEffect(() => {
    if (page.page !== requestedPage) setRequestedPage(page.page);
  }, [page.page, requestedPage]);
  function filter(patch: Partial<InboxFilters>) {
    setPriority(false);
    setSpecial('all');
    setLinkedMessageId(null);
    setFilters((current) => ({ ...current, ...patch }));
    setRequestedPage(1);
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
      if (result.item?.id !== item.id || !result.item.topicSignalId) throw new Error('同步结果未确认，请刷新后核对。');
      setSyncReceipts((current) => ({ ...current, [item.id]: result.item.topicSignalId! }));
      setNotice('已同步为选题输入。待回复状态保持不变，不会向平台发送消息。');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '同步失败，原消息已保留。');
      await refresh();
    } finally {
      setBusyId(null);
    }
  }
  const categoryOf = active?.classification.status === 'ready' ? active.classification.result.category : null;
  const signalId = active ? (active.topicSignalId ?? syncReceipts[active.id]) : null;
  const evidence = assessment?.observed.reply;
  return (
    <main className="workspace inbox-workspace">
      <WorkspaceHeader current="/inbox" date={today} syncWindow={syncWindow} />
      <MessageNavigation current="inbox" />
      <PageHeader
        title="互动收件箱"
        summary={summary.valuableWaiting ? '先回复商单，再看问题与观点' : '查看消息，挑选值得送进选题的需求'}
        onRefresh={() => void reload()}
        refreshing={refreshing}
        action={
          <Button
            variant="primary"
            onClick={() => {
              filter({ ...blankFilters, reply: 'waiting' });
              setPriority(true);
            }}
          >
            查看值得回复的消息
          </Button>
        }
      />
      <details className="card inbox-sources">
        <summary>
          {data.sources.length} 个来源 · {data.sources.filter((s) => s.status === 'ready').length} 个已读取
          {data.sources
            .filter((s) => s.status === 'failed')
            .map((s) => ` · 读取失败（${platformName(s.platformId)}${channelName(s.channel)}）`)
            .join('')}
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
      <div className="inbox-overview" aria-label="消息统计">
        <Button
          aria-pressed={priority}
          onClick={() => {
            filter({ ...blankFilters, reply: 'waiting' });
            setPriority(true);
          }}
        >
          有价值消息待回复 <strong>{summary.valuableWaiting}</strong>
        </Button>
        <Button onClick={() => filter({ ...blankFilters, reply: 'waiting' })}>
          全部待回复会话 / 评论 <strong>{summary.waiting}</strong>
        </Button>
        <Button
          onClick={() => {
            filter(blankFilters);
            setSpecial('topics');
          }}
        >
          可送入选题 <strong>{topics}</strong>
        </Button>
        <Button
          onClick={() => {
            filter(blankFilters);
            setSpecial('unclassified');
          }}
        >
          待识别 / 失败 <strong>{unclassified}</strong>
        </Button>
        <Button className="stored-count" onClick={() => filter(blankFilters)}>
          全部已存消息 {data.items.length}
        </Button>
      </div>
      <p className="inbox-view-name">{priority ? '待回复的有价值消息' : '按当前条件查看消息'}</p>
      <details
        className="inbox-filter-disclosure"
        open={
          filters.platform !== 'all' ||
          filters.channel !== 'all' ||
          !!filters.query ||
          filters.classification !== 'all' ||
          (!priority && filters.reply !== 'all')
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
              <option value="replied">已回复</option>
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
          <Button
            onClick={() => {
              setFilters(blankFilters);
              setPriority(false);
              setSpecial('all');
              setLinkedMessageId(null);
              setRequestedPage(1);
            }}
          >
            重置筛选
          </Button>
        </div>
      </details>
      {linkedMessageId && (
        <div className="deal-linked">
          <span>正在查看关联的原始消息</span>
          <Button
            onClick={() => {
              setLinkedMessageId(null);
              setSelectedId(null);
            }}
          >
            查看全部消息
          </Button>
        </div>
      )}
      {notice && (
        <p className="topic-feedback" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="topic-feedback" role="alert">
          {error}
        </p>
      )}
      <div className="inbox-grid">
        <details className="card inbox-themes-disclosure" open={!!filters.themeId}>
          <summary>需求主题</summary>

          <div className="inbox-themes">
            {visibleThemes.slice(0, showAllThemes ? undefined : 8).map((t) => (
              <Button
                key={t.id}
                className={`list-row ${filters.themeId === t.id ? 'active' : ''}`}
                aria-pressed={filters.themeId === t.id}
                onClick={() =>
                  filter({ themeId: t.id, category: 'all', reply: 'all', classification: 'all', query: '' })
                }
              >
                <strong>{t.title}</strong>
                <span className="small">{themeMessages(t, scoped).length} 条</span>
                <span aria-hidden="true">→</span>
              </Button>
            ))}
            {visibleThemes.length > 8 && (
              <Button variant="text" onClick={() => setShowAllThemes(!showAllThemes)}>
                {showAllThemes ? '收起' : `还有 ${visibleThemes.length - 8} 个`}
              </Button>
            )}
          </div>
          {!data.themes.length ? (
            <Empty>暂无已汇总的需求主题</Empty>
          ) : !data.themes.some((t) => themeMessages(t, scoped).length) &&
            !(filters.platform === 'all' && filters.channel === 'all') ? (
            <Empty>当前范围没有需求主题来源</Empty>
          ) : null}
          {filters.themeId && <Button onClick={() => filter({ themeId: null })}>清除主题筛选</Button>}
        </details>
        <Card title="消息列表" className="inbox-list-card">
          {theme && (
            <div className="inbox-theme-summary">
              <strong>{theme.title}</strong>
              <p>{theme.summary}</p>
              {theme.messageIds.some((id) => !data.items.some((item) => item.id === id)) && (
                <span className="small">部分来源记录暂不可用</span>
              )}
            </div>
          )}
          <div className="inbox-message-list">
            {page.items.length ? (
              page.items.map((item) => {
                const state = assessments.get(item.id)?.state ?? 'unknown';
                return (
                  <article className="message-item" key={item.id}>
                    <Button
                      className={`inbox-message list-row ${active?.id === item.id ? 'active' : ''}`}
                      aria-pressed={active?.id === item.id}
                      onClick={() => {
                        setSelectedId(item.id);
                        setNotice('');
                      }}
                    >
                      <div className="inbox-message-meta">
                        <span>
                          {platformName(item.platformId)} · {channelName(item.channel)}
                        </span>
                        <time className="mono" dateTime={item.sentAt ?? undefined}>
                          {inboxTime(item.sentAt)}
                        </time>
                      </div>
                      <div className="inbox-message-title">
                        <strong>{item.author || '发送者未识别'}</strong>
                        <span className="inbox-reply-state">{replyLabels[state]}</span>
                      </div>
                      <p className="inbox-message-body">{item.body || '原文未读取完整'}</p>
                      <div className="inbox-message-tags">
                        <span>{messageCategory(item)}</span>
                        {item.dealId && <span>已进入商单</span>}
                        {(item.topicSignalId || syncReceipts[item.id]) && <span>已同步选题输入</span>}
                        {item.contentTitle && <span className="inbox-message-work">{item.contentTitle}</span>}
                      </div>
                    </Button>
                    {active?.id === item.id && <ReplyActions message={item} destinations={destinations} />}
                  </article>
                );
              })
            ) : (
              <Empty>
                {!data.recordsReady
                  ? '暂无消息记录，完成读取后出现'
                  : linkedMessageId
                    ? '关联消息暂不可用，请刷新或返回全部消息'
                    : data.items.length
                      ? '没有符合当前筛选的消息'
                      : '暂无已读取的评论或私信'}
              </Empty>
            )}
          </div>
          {page.pages > 1 && (
            <div className="inbox-pagination">
              <span className="small">按消息时间倒序 · 每页 {config.pageSize} 条</span>
              <Button
                aria-label="上一页消息"
                disabled={page.page === 1}
                disabledReason="已经是第一页。"
                onClick={() => setRequestedPage(page.page - 1)}
              >
                ←
              </Button>
              <span className="mono">{data.recordsReady ? `${page.page} / ${page.pages}` : '-- / --'}</span>
              <Button
                aria-label="下一页消息"
                disabled={page.page === page.pages}
                disabledReason="已经是最后一页。"
                onClick={() => setRequestedPage(page.page + 1)}
              >
                →
              </Button>
            </div>
          )}
        </Card>
        <aside className="inbox-detail-column">
          <Card title="消息详情" className="inbox-detail">
            {!active ? (
              <Empty>没有符合条件的消息</Empty>
            ) : (
              <>
                <div className="inbox-detail-heading">
                  <strong>{active.author || '发送者未识别'}</strong>
                  <span className="small">
                    {platformName(active.platformId)} · {channelName(active.channel)} · {inboxTime(active.sentAt)}
                  </span>
                </div>
                <ReplyActions message={active} destinations={destinations} />
                <p className="inbox-original">{active.body || '原文尚未读取完整'}</p>
                <dl className="inbox-evidence">
                  <div>
                    <dt>关联作品</dt>
                    <dd>{active.contentTitle ?? '未关联'}</dd>
                  </div>
                  <div>
                    <dt>本条读取时间</dt>
                    <dd className="mono">{inboxTime(active.capturedAt)}</dd>
                  </div>
                  <div>
                    <dt>回复状态</dt>
                    <dd>{replyLabels[assessment?.state ?? 'unknown']}</dd>
                  </div>
                  <div>
                    <dt>状态依据读取于</dt>
                    <dd className="mono">{inboxTime(assessment?.observed.capturedAt ?? null)}</dd>
                  </div>
                </dl>
                <details>
                  <summary>查看回复依据 →</summary>
                  <p className="inbox-reply-explanation">
                    {assessment?.state === 'unknown'
                      ? '回复证据不足或不一致，暂不能判定是否待回复。'
                      : evidence?.kind === 'dm'
                        ? `本会话最后一条由${evidence.lastSender === 'self' ? '我方' : '对方'}发送；以最近一次已核实的会话读取为准。`
                        : evidence?.kind === 'comment' && evidence.ownReplyFound
                          ? '已在该评论下识别到我方回复。'
                          : '已完整读取评论回复范围，尚未发现我方回复。'}
                  </p>
                </details>
                {evidence?.kind === 'dm' && (
                  <p className="small">
                    会话末条时间：<span className="mono">{inboxTime(evidence.lastMessageAt)}</span>
                  </p>
                )}
                {active.reply.kind === 'comment' && (
                  <p className="small">
                    评论互动：点赞 <span className="mono">{active.reply.likes ?? '--'}</span> · 回复{' '}
                    <span className="mono">{active.reply.replyCount ?? '--'}</span>
                  </p>
                )}
                <div className="inbox-classification">
                  <strong>{messageCategory(active)}</strong>
                  <p>
                    {active.classification.status === 'ready'
                      ? active.classification.result.reason
                      : (active.classification.reason ?? '等待分类服务处理')}
                  </p>
                </div>
                <details className="inbox-context">
                  <summary>
                    {active.channel === 'dm' ? '会话上下文' : '评论上下文'} ·{' '}
                    {active.contextComplete ? '已读完整' : '可能不完整'}
                  </summary>
                  {active.context.length ? (
                    <div>
                      {active.context.map((entry) => (
                        <div className={`inbox-context-entry ${entry.sender === 'self' ? 'self' : ''}`} key={entry.id}>
                          <header>
                            <strong>{entry.sender === 'self' ? '我方' : entry.author || '发送者未识别'}</strong>
                            <time className="mono">{inboxTime(entry.sentAt)}</time>
                          </header>
                          <p>{entry.body || '内容未识别'}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Empty>暂无可展示的上下文记录</Empty>
                  )}
                </details>
                <div className="inbox-source-link">
                  {active.sourceUrl && /^https?:\/\//.test(active.sourceUrl) ? (
                    <a href={active.sourceUrl} target="_blank" rel="noreferrer">
                      查看原始平台页面 →
                    </a>
                  ) : (
                    <span className="small">原始页面链接暂不可用</span>
                  )}
                </div>
              </>
            )}
          </Card>
          {active && (
            <Card title="后续流转">
              <div className="inbox-handoff">
                {categoryOf === 'deal' ? (
                  <>
                    <strong>
                      {active.dealId
                        ? '已关联商单记录'
                        : active.dealSync === 'failed'
                          ? '商单入库失败'
                          : '等待自动进入商单列表'}
                    </strong>
                    <p>{active.dealSyncReason ?? ''}</p>
                    <Link href={active.dealId ? `/deals?deal=${encodeURIComponent(active.dealId)}` : '/deals'}>
                      {active.dealId ? '查看关联商单 →' : '查看商单列表 →'}
                    </Link>
                  </>
                ) : categoryOf === 'idea' ? (
                  <>
                    <strong>{signalId ? '已同步为选题输入' : '可作为选题输入'}</strong>

                    {active.topicSyncedAt && <span className="small">同步于 {inboxTime(active.topicSyncedAt)}</span>}
                    <Button
                      disabled={!data.topicSyncReady || !!busyId || !!signalId}
                      disabledReason={!data.topicSyncReady ? '选题同步暂不可用。' : '请等待当前同步完成。'}
                      onClick={() => void syncTopic(active)}
                    >
                      {busyId === active.id ? '正在同步…' : signalId ? '已同步选题输入' : '同步到选题中心'}
                    </Button>
                    <Link href="/topics">去选题中心 →</Link>
                  </>
                ) : categoryOf === 'other' ? (
                  <>
                    <strong>不进入商单或选题流程</strong>
                  </>
                ) : (
                  <>
                    <strong>分类完成后再流转</strong>
                  </>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}
