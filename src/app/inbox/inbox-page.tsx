'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Platform } from '@/lib/config';
import {
  assessReplies,
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
import { Button, Card, Empty, Segmented } from '@/ui/components';
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
const sourceLabels = { ready: '读取完成', pending: '等待读取', failed: '读取失败', unavailable: '未接入' };
export default function InboxPage({
  config,
  platforms,
  initialData,
  initialMessageId,
  initialThemeId = null,
  today,
  syncWindow,
}: {
  initialThemeId?: string | null;
  initialMessageId: string | null;
  config: InboxConfig;
  platforms: Platform[];
  initialData: InboxData;
  today: string;
  syncWindow: string;
}) {
  const { data, error, refresh } = useResource('/api/inbox', initialData);
  const [filters, setFilters] = useState<InboxFilters>({ ...blankFilters, themeId: initialThemeId });
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
      ? (config.categories.find((c) => c.id === classification.result.category)?.name ?? '分类不可用')
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
  const filtered = filterInbox(data.items, data.themes, filters).filter(
    (item) => !linkedMessageId || item.id === linkedMessageId,
  );
  const page = inboxPage(filtered, requestedPage, config.pageSize);
  const active = page.items.find((item) => item.id === selectedId) ?? null;
  const assessments = assessReplies(data.items);
  const assessment = active ? assessments.get(active.id) : null;
  const theme = filters.themeId ? data.themes.find((t) => t.id === filters.themeId) : null;
  const displayCount = (value: number) => (data.recordsReady ? value.toLocaleString('en-US') : '--');
  const unclassified = scoped.filter((item) => item.classification.status !== 'ready').length;
  const topics = scoped.filter(
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
      if (result.item?.id !== item.id || !result.item.topicSignalId)
        throw new Error('同步结果未确认，请刷新记录后核对。');
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
      <div className="modebar">
        <span className="eyebrow">06 · INTERACTION INBOX</span>
        <span>{data.message}</span>
      </div>
      <div className="topics-heading">
        <div>
          <h1>互动收件箱</h1>
          <p>从评论与私信里，看见合作机会和真实问题。</p>
        </div>
        <div className="image-heading-actions">
          <span className="small">平台只读 · 不自动回复</span>
          <Button disabled={refreshing} onClick={() => void reload()}>
            {refreshing ? '正在读取记录…' : '刷新已存记录'}
          </Button>
        </div>
      </div>
      <Card
        index="00"
        title="读取状态"
        meta={<span className="eyebrow">DAILY · {syncWindow}</span>}
        className="inbox-sources"
      >
        <p className="small inbox-source-note">
          随每日主抓取读取一次。刷新仅重新加载本机记录，不触发额外抓取；平台回复后，待回复状态随下次读取更新。
        </p>
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
                {source.reason && <p>{source.reason}</p>}
              </div>
            ))}
          </div>
        ) : (
          <Empty>尚无评论或私信读取记录</Empty>
        )}
      </Card>
      <div className="inbox-filters">
        <label>
          平台
          <select aria-label="筛选平台" value={filters.platform} onChange={(e) => filter({ platform: e.target.value })}>
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
            setLinkedMessageId(null);
            setRequestedPage(1);
          }}
        >
          重置筛选
        </Button>
      </div>
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
      <div className="inbox-overview" aria-label="当前平台与类型范围统计">
        <div>
          <span>已存消息</span>
          <strong className="mono">{displayCount(scoped.length)}</strong>
        </div>
        <button
          onClick={() => filter({ reply: 'waiting', category: 'all', classification: 'all', query: '', themeId: null })}
        >
          <span>待回复会话 / 评论</span>
          <strong className="mono">{displayCount(waitingCount(scoped, data.items))}</strong>
        </button>
        <div>
          <span>尚未同步的问题与观点</span>
          <strong className="mono">{displayCount(topics)}</strong>
        </div>
        <div>
          <span>待识别 / 识别失败</span>
          <strong className="mono">{displayCount(unclassified)}</strong>
        </div>
        <p>统计随平台与消息类型变化。私信按会话计算待回复，评论按条计算；同步选题不等于已回复。</p>
      </div>
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
        <aside className="inbox-sidebar">
          <Card index="01" title="消息分类" meta={<span className="eyebrow">TRIAGE</span>}>
            <div className="inbox-category-list">
              <button
                aria-pressed={filters.category === 'all'}
                className={filters.category === 'all' ? 'active' : ''}
                onClick={() => filter({ category: 'all', themeId: null })}
              >
                <strong>全部消息</strong>
                <span className="mono">{displayCount(scoped.length)}</span>
              </button>
              {config.categories.map((category) => (
                <button
                  key={category.id}
                  aria-pressed={filters.category === category.id}
                  className={filters.category === category.id ? 'active' : ''}
                  onClick={() => filter({ category: category.id, themeId: null })}
                >
                  <div>
                    <strong>{category.name}</strong>
                    <p>{category.description}</p>
                  </div>
                  <span className="mono">
                    {displayCount(
                      scoped.filter(
                        (item) =>
                          item.classification.status === 'ready' && item.classification.result.category === category.id,
                      ).length,
                    )}
                  </span>
                </button>
              ))}
            </div>
            <p className="small inbox-note">待识别与识别失败的消息仍保留在“全部消息”，不会自动归入“其他”。</p>
          </Card>
          <Card index="02" title="需求主题" meta={<span className="eyebrow">SIGNALS</span>}>
            <div className="inbox-themes">
              {data.themes
                .filter(
                  (t) =>
                    themeMessages(t, scoped).length > 0 || (filters.platform === 'all' && filters.channel === 'all'),
                )
                .map((t) => (
                  <button
                    key={t.id}
                    className={filters.themeId === t.id ? 'active' : ''}
                    aria-pressed={filters.themeId === t.id}
                    onClick={() =>
                      filter({ themeId: t.id, category: 'all', reply: 'all', classification: 'all', query: '' })
                    }
                  >
                    <strong>{t.title}</strong>
                    <span className="small">{themeMessages(t, scoped).length} 条当前范围来源</span>
                  </button>
                ))}
            </div>
            {!data.themes.length ? (
              <Empty>暂无已汇总的需求主题</Empty>
            ) : !data.themes.some((t) => themeMessages(t, scoped).length) &&
              !(filters.platform === 'all' && filters.channel === 'all') ? (
              <Empty>当前范围没有需求主题来源</Empty>
            ) : null}
            {filters.themeId && <Button onClick={() => filter({ themeId: null })}>清除主题筛选</Button>}
            <p className="small inbox-note">主题保留原消息来源，可逐条核对后同步到选题中心。</p>
          </Card>
        </aside>
        <Card
          index="03"
          title="消息列表"
          meta={<span className="eyebrow">{data.recordsReady ? filtered.length : '--'} RECORDS</span>}
          className="inbox-list-card"
        >
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
                  <button
                    key={item.id}
                    className={`inbox-message ${active?.id === item.id ? 'active' : ''}`}
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
                  </button>
                );
              })
            ) : (
              <Empty>
                {!data.recordsReady
                  ? '读取服务待接入，暂无消息记录'
                  : linkedMessageId
                    ? '关联消息暂不可用，请刷新或返回全部消息'
                    : data.items.length
                      ? '没有符合当前筛选的消息'
                      : '暂无已读取的评论或私信'}
              </Empty>
            )}
          </div>
          <div className="inbox-pagination">
            <span className="small">按消息时间倒序 · 每页 {config.pageSize} 条</span>
            <Button aria-label="上一页消息" disabled={page.page === 1} onClick={() => setRequestedPage(page.page - 1)}>
              ←
            </Button>
            <span className="mono">{data.recordsReady ? `${page.page} / ${page.pages}` : '-- / --'}</span>
            <Button
              aria-label="下一页消息"
              disabled={page.page === page.pages}
              onClick={() => setRequestedPage(page.page + 1)}
            >
              →
            </Button>
          </div>
        </Card>
        <aside className="inbox-detail-column">
          <Card
            index="04"
            title="原文与上下文"
            meta={<span className="eyebrow">READ ONLY</span>}
            className="inbox-detail"
          >
            {!active ? (
              <Empty>选择一条消息查看原文与判定依据</Empty>
            ) : (
              <>
                <div className="inbox-detail-heading">
                  <strong>{active.author || '发送者未识别'}</strong>
                  <span className="small">
                    {platformName(active.platformId)} · {channelName(active.channel)} · {inboxTime(active.sentAt)}
                  </span>
                </div>
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
                <p className="inbox-reply-explanation">
                  {assessment?.state === 'unknown'
                    ? '回复证据不足或不一致，暂不能判定是否待回复。'
                    : evidence?.kind === 'dm'
                      ? `本会话最后一条由${evidence.lastSender === 'self' ? '我方' : '对方'}发送；以最近一次已核实的会话读取为准。`
                      : evidence?.kind === 'comment' && evidence.ownReplyFound
                        ? '已在该评论下识别到我方回复。'
                        : '已完整读取评论回复范围，尚未发现我方回复。'}
                </p>
                {evidence?.kind === 'dm' && (
                  <p className="small">
                    会话末条时间：<span className="mono">{inboxTime(evidence.lastMessageAt)}</span>
                  </p>
                )}
                <div className="inbox-classification">
                  <span className="eyebrow">CLASSIFICATION</span>
                  <strong>{messageCategory(active)}</strong>
                  <p>
                    {active.classification.status === 'ready'
                      ? active.classification.result.reason
                      : (active.classification.reason ?? '等待分类服务处理')}
                  </p>
                </div>
                <details className="inbox-context" open>
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
                      查看原始平台页面 ↗
                    </a>
                  ) : (
                    <span className="small">原始页面链接暂不可用</span>
                  )}
                </div>
              </>
            )}
          </Card>
          {active && (
            <Card index="05" title="后续流转" meta={<span className="eyebrow">HANDOFF</span>}>
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
                    <p>
                      {active.dealSyncReason ?? '商单线索由服务自动入库，并推送到总控台今日行动，无需逐条手工添加。'}
                    </p>
                    <Link href={active.dealId ? `/deals?deal=${encodeURIComponent(active.dealId)}` : '/deals'}>
                      {active.dealId ? '查看关联商单 →' : '查看商单列表 →'}
                    </Link>
                  </>
                ) : categoryOf === 'idea' ? (
                  <>
                    <strong>{signalId ? '已同步为选题输入' : '可作为选题输入'}</strong>
                    <p>同步保留原文、发送者、平台和作品来源；不会向对方发送消息，也不会改变待回复状态。</p>
                    {active.topicSyncedAt && <span className="small">同步于 {inboxTime(active.topicSyncedAt)}</span>}
                    <Button
                      disabled={!data.topicSyncReady || !!busyId || !!signalId}
                      title={!data.topicSyncReady ? '选题输入同步服务待接入' : undefined}
                      onClick={() => void syncTopic(active)}
                    >
                      {busyId === active.id ? '正在同步…' : signalId ? '已同步选题输入' : '同步到选题中心'}
                    </Button>
                    <Link href="/topics">去选题中心 →</Link>
                    {!data.topicSyncReady && <span className="small">同步服务待接入，此操作暂不可用。</span>}
                  </>
                ) : categoryOf === 'other' ? (
                  <>
                    <strong>不进入商单或选题流程</strong>
                    <p>保留原消息供查看，不自动回复，不在平台上做任何操作。</p>
                  </>
                ) : (
                  <>
                    <strong>分类完成后再流转</strong>
                    <p>识别未完成或失败时，不猜测分类，不自动创建商单或选题输入。</p>
                  </>
                )}
              </div>
            </Card>
          )}
        </aside>
      </div>
      <footer className="layout-foot">
        <span>一条消息可贡献选题；同一私信会话只计一次待回复。</span>
        <span>读取 → 分类 → 商单 / 需求主题 / 选题输入</span>
      </footer>
    </main>
  );
}
