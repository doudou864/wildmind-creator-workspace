'use client';
import Link from 'next/link';
import { ContentPicker } from '@/ui/content-picker';
import type { Content } from '@/lib/content-model';
import { useState } from 'react';
import type { Parameters } from '@/lib/config';
import type { TopicChannel } from '@/lib/topic-channels';
import {
  filterTopics,
  topicFire,
  topicEvidence,
  topicStatusLabels,
  type Topic,
  type TopicData,
} from '@/lib/topic-model';
import { number } from '@/lib/format';
import { Button, Card, Dialog, Empty, Segmented, Tag } from '@/ui/components';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { request, useResource } from '@/ui/use-resource';

type StatusFilter = 'candidate' | 'selected' | 'skipped' | 'published' | 'all';
type KindFilter = 'all' | 'fire' | 'explore';
export default function TopicsPage({
  parameters,
  channels,
  channelDocument,
  initialData,
  today,
}: {
  parameters: Parameters;
  channels: TopicChannel[];
  channelDocument: string;
  initialData: TopicData;
  today: string;
}) {
  const { data, error, refresh } = useResource('/api/topics', initialData);
  const [status, setStatus] = useState<StatusFilter>('candidate');
  const [kind, setKind] = useState<KindFilter>('all');
  const [channelId, setChannelId] = useState('all');
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState('');
  const [modal, setModal] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [production, setProduction] = useState<{ topicId: string; content: Content } | null>(null);
  const fireEnabled = data.d21Samples !== null && data.d21Samples >= parameters.topicFireMinimum;
  const topics = data.topics;
  const visible = filterTopics(topics, status, kind, channelId, query, fireEnabled);
  const focused = visible.find((t) => t.id === focusId) ?? visible[0];
  const evidence = focused ? topicEvidence(focused, fireEnabled) : null;
  const source = channels.find((c) => c.id === focused?.channelId);
  const saved = topics.filter((t) => t.status === 'selected');
  const candidateCount = topics.filter((t) => t.status === 'candidate').length;
  const enabled = channels.filter((c) => c.enabled);
  const canChange = data.writeReady && !busy;
  const isFire = (topic: Topic) => topicFire(topic, fireEnabled);
  async function updateTopic(topic: Topic, nextStatus: 'candidate' | 'selected' | 'skipped') {
    if (!canChange) return;
    setBusy(true);
    setNotice('正在保存…');
    try {
      await request(`/api/topics/${encodeURIComponent(topic.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      setNotice(`${topic.title} · ${topicStatusLabels[nextStatus]}，已保存。`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败，未更改选择');
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function generate() {
    if (!data.generationReady || busy) return;
    setBusy(true);
    try {
      await request('/api/topics/generate', { method: 'POST' });
      await refresh();
      setNotice('候选已更新');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '生成失败');
    } finally {
      setBusy(false);
    }
  }
  const count = (n: number) => String(n).padStart(2, '0');
  function clear() {
    setQuery('');
    setKind('all');
    setChannelId('all');
    setStatus('candidate');
  }
  return (
    <main className="workspace topics-workspace">
      <WorkspaceHeader current="/topics" date={today} syncWindow={parameters.syncWindow} />
      <div className="modebar">
        <p>
          <span className="mode-label mono">LOCAL</span>
          {data.serviceMessage}
        </p>
        <Button className="text-button" onClick={() => void refresh()}>
          刷新记录 ↻
        </Button>
      </div>
      <div className="topics-heading">
        <div>
          <span className="eyebrow">TOPIC DISCOVERY</span>
          <h1>
            选题中心<span className="heading-separator">/</span>
            <span>下一条，做什么？</span>
          </h1>
        </div>
        <div className="topic-generation">
          <span className="small">{data.generationReady ? '按启用渠道生成' : '选题生成服务待接入'}</span>
          <Button className="selected" disabled={!data.generationReady || busy} onClick={() => void generate()}>
            生成 {parameters.topicCandidateCount} 个候选
          </Button>
        </div>
      </div>
      <section className="card topic-summary" aria-label="选题概况">
        <div className="topic-summary-intro">
          <span className="eyebrow">00 · TOPIC LIBRARY</span>
          <p>选题库</p>
          <small>历史记录持续保留</small>
        </div>
        {[
          { value: candidateCount, label: '待筛选' },
          { value: saved.length, label: '已选中' },
          { value: topics.filter((t) => t.exploration).length, label: '探索方向' },
          { value: topics.filter(isFire).length, label: 'FIRE 标记' },
        ].map((item) => (
          <div className="topic-summary-item" key={item.label}>
            <strong className="mono">{count(item.value)}</strong>
            <span>{item.label}</span>
          </div>
        ))}
        <div className="topic-summary-note">
          <span className="eyebrow">PREFERENCE → DIRECTION</span>
          <p>
            偏好决定推什么
            <br />
            表现决定标什么
          </p>
        </div>
      </section>
      <div className="topic-feedback" role="status" aria-live="polite">
        {error ||
          notice ||
          `每批 ${parameters.topicCandidateCount} 个候选，含 ${parameters.topicExploreMin}–${parameters.topicExploreMax} 个探索位；热度证据范围见具体来源。`}
      </div>
      <div className="topics-grid">
        <aside className="topic-sidebar">
          <Card index="01" title="输入渠道" meta={<span className="eyebrow">{enabled.length} ON</span>}>
            <button
              className={`channel-filter ${channelId === 'all' ? 'active' : ''}`}
              aria-pressed={channelId === 'all'}
              onClick={() => setChannelId('all')}
            >
              <span>全部渠道</span>
              <span className="mono">{topics.length}</span>
            </button>
            {channels.map((channel) => (
              <button
                key={channel.id}
                className={`channel-filter ${channelId === channel.id ? 'active' : ''}`}
                aria-pressed={channelId === channel.id}
                onClick={() => setChannelId(channel.id)}
              >
                <span>
                  <b>{channel.name}</b>
                  <small>{channel.enabled ? channel.type : '已停用 · 历史记录保留'}</small>
                </span>
                <span className="mono">{topics.filter((t) => t.channelId === channel.id).length}</span>
              </button>
            ))}
            <div className="channel-config">
              <p className="small">
                外部渠道 {channels.filter((c) => c.kind === 'external').length} 个 · 在渠道文档中增删
              </p>
              <Button onClick={() => setModal(true)}>查看渠道文档 ↗</Button>
            </div>
          </Card>
          <Card index="04" title="FIRE 开启条件">
            <div className="sample-count">
              <strong className="mono">{number(data.d21Samples)}</strong>
              <span className="mono">/ {parameters.topicFireMinimum}</span>
            </div>
            <p className="small">有 D21 结果的抖音作品，含历史补录</p>
            <div
              className="sample-track"
              role="progressbar"
              aria-label="FIRE 开启样本进度"
              aria-valuemin={0}
              aria-valuemax={parameters.topicFireMinimum}
              aria-valuenow={Math.min(data.d21Samples ?? 0, parameters.topicFireMinimum)}
            >
              <span
                style={{ width: `${Math.min(100, ((data.d21Samples ?? 0) / parameters.topicFireMinimum) * 100)}%` }}
              />
            </div>
            <p className="sample-status">
              {data.d21Samples === null
                ? '复盘服务待接入，样本数未知'
                : fireEnabled
                  ? '已达到开启门槛'
                  : `还差 ${parameters.topicFireMinimum - data.d21Samples} 条 D21 结果`}
            </p>
            <p className="small topic-rule">样本不足仍可选题，不新增 FIRE。首次选中的标记与依据永久保留。</p>
          </Card>
        </aside>
        <Card
          index="02"
          title="候选方向"
          meta={<span className="eyebrow">{visible.length} ITEMS</span>}
          className="topic-list-card"
        >
          <div className="topic-status-tabs">
            <Segmented<StatusFilter>
              label="选题状态"
              value={status}
              onChange={setStatus}
              options={[
                ...(['candidate', 'selected', 'skipped', 'published'] as const).map((value) => ({
                  value,
                  label: `${topicStatusLabels[value]} ${count(topics.filter((t) => t.status === value).length)}`,
                })),
                { value: 'all', label: '全部' },
              ]}
            />
          </div>
          <div className="topic-search">
            <label htmlFor="topic-search" className="sr-only">
              搜索选题或原始线索
            </label>
            <input
              id="topic-search"
              type="search"
              placeholder="搜索方向或原始线索"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Segmented<KindFilter>
              label="选题类型"
              value={kind}
              onChange={setKind}
              options={[
                { value: 'all', label: '全部' },
                { value: 'fire', label: 'FIRE' },
                { value: 'explore', label: '探索' },
              ]}
            />
          </div>
          <div className="topic-list" aria-label="候选选题列表">
            {visible.map((topic, index) => (
              <article
                className={`topic-row ${focused?.id === topic.id ? 'focused' : ''}`}
                key={topic.id}
                data-topic-id={topic.id}
              >
                <span className="topic-number mono">{count(index + 1)}</span>
                <div className="topic-row-content">
                  <div className="topic-row-title">
                    <button
                      className="topic-title"
                      aria-pressed={focused?.id === topic.id}
                      onClick={() => setFocusId(topic.id)}
                    >
                      {topic.title}
                    </button>
                    {isFire(topic) && <Tag>FIRE</Tag>}
                    {topic.exploration && <Tag outline>EXPLORE</Tag>}
                  </div>
                  <p className="topic-direction">{topic.direction}</p>
                  <div className="topic-row-footer">
                    <span>{channels.find((c) => c.id === topic.channelId)?.name ?? '来源渠道已移除'}</span>
                    <div className="topic-row-actions">
                      {topic.status === 'candidate' ? (
                        <>
                          <Button disabled={!canChange} onClick={() => void updateTopic(topic, 'skipped')}>
                            跳过
                          </Button>
                          <Button
                            className="selected"
                            disabled={!canChange}
                            onClick={() => void updateTopic(topic, 'selected')}
                          >
                            选中
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="decision-label">{topicStatusLabels[topic.status]}</span>
                          {topic.status !== 'published' && (
                            <Button disabled={!canChange} onClick={() => void updateTopic(topic, 'candidate')}>
                              移回候选
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}
            {!visible.length && (
              <Empty>{topics.length ? '没有符合当前筛选条件的选题' : '暂无候选，等待选题服务接入'}</Empty>
            )}
          </div>
          <div className="topic-list-bottom">
            <span>停用渠道不影响历史候选与已选记录</span>
            <Button className="text-button" onClick={clear}>
              清除筛选
            </Button>
          </div>
        </Card>
        <aside className="topic-detail-column">
          <Card index="03" title="选题依据" className="topic-detail-card">
            {focused ? (
              <>
                <div className="detail-topic-tags">
                  {isFire(focused) && <Tag>FIRE</Tag>}
                  {focused.exploration && <Tag outline>EXPLORE</Tag>}
                  <span className="small">{focused.selectedAt ? '首次选中时已定格' : '尚未选中'}</span>
                </div>
                <h3>{focused.title}</h3>
                <p className="detail-direction">{focused.direction}</p>
                <div className="topic-detail-section">
                  <h4 className="eyebrow">SOURCE · 原始线索</h4>
                  <blockquote>{focused.signal}</blockquote>
                  <p className="small">
                    {source?.name ?? '来源渠道已移除'} · {focused.sourceContext}
                  </p>
                  <dl className="topic-source-meta">
                    <div>
                      <dt>采集位置</dt>
                      <dd>{source?.location ?? '--'}</dd>
                    </div>
                    <div>
                      <dt>原始链接</dt>
                      <dd>
                        {focused.sourceUrl ? (
                          <a href={focused.sourceUrl} target="_blank" rel="noreferrer">
                            查看原始来源 ↗
                          </a>
                        ) : (
                          '--'
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="topic-detail-section">
                  <h4 className="eyebrow">EVIDENCE · 推荐依据</h4>
                  {evidence ? (
                    <>
                      <p className="topic-evidence">{evidence.reason}</p>
                      <div className="evidence-numbers">
                        <div>
                          <strong className="mono">{number(evidence.d21, 1)}×</strong>
                          <span>D21 平均倍数</span>
                        </div>
                        <div>
                          <strong className="mono">{evidence.count}</strong>
                          <span>同类历史作品</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="small topic-rule">
                      {focused.selectedAt
                        ? '选中时未标记 FIRE，保留首次判断。'
                        : !fireEnabled
                          ? '样本尚未达到门槛，不新增 FIRE。'
                          : '暂无同类历史表现依据，不标记 FIRE。'}
                    </p>
                  )}
                </div>
                <div className="detail-topic-actions">
                  {focused.status !== 'published' && (
                    <Button
                      className="selected"
                      disabled={!canChange}
                      onClick={() =>
                        void updateTopic(focused, focused.status === 'selected' ? 'candidate' : 'selected')
                      }
                    >
                      {focused.status === 'selected' ? '移回候选' : '选中这个方向'}
                    </Button>
                  )}
                  {focused.status === 'selected' && (
                    <div>
                      <ContentPicker
                        value={production?.topicId === focused.id ? production.content.id : null}
                        topicId={focused.id}
                        onChange={(_, content) => setProduction(content ? { topicId: focused.id, content } : null)}
                      />
                      {production?.topicId === focused.id && (
                        <div className="detail-topic-actions">
                          <Link
                            className="button"
                            href={`/images?content=${encodeURIComponent(production.content.id)}&topic=${encodeURIComponent(focused.id)}`}
                          >
                            制作图片 →
                          </Link>
                          <Link
                            className="button"
                            href={
                              production.content.form === '图文'
                                ? `/layouts?content=${encodeURIComponent(production.content.id)}&topic=${encodeURIComponent(focused.id)}`
                                : `/publishing?content=${encodeURIComponent(production.content.id)}&kind=video`
                            }
                          >
                            {production.content.form === '图文' ? '开始排版 →' : '准备视频发布 →'}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Empty>选择一个候选，查看来源与依据</Empty>
            )}
          </Card>
          <Card index="05" title="已选清单" meta={<span className="eyebrow">{count(saved.length)} PICKED</span>}>
            {saved.length ? (
              <div className="picked-list">
                {saved.map((topic) => (
                  <button
                    key={topic.id}
                    onClick={() => {
                      setStatus('selected');
                      setKind('all');
                      setChannelId('all');
                      setQuery('');
                      setFocusId(topic.id);
                    }}
                  >
                    <span>{topic.title}</span>
                    {isFire(topic) && <Tag>FIRE</Tag>}
                    <span>↗</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty>还没有选中的方向</Empty>
            )}
            <p className="small topic-rule">选中后可进入生图中心，关联封面与配图。</p>
          </Card>
        </aside>
      </div>
      <footer className="footer">
        <span className="mono">WILDMIND / TOPIC DISCOVERY</span>
        <span>选题与表现分开判断 · 首次选择保留依据</span>
      </footer>
      {modal && (
        <Dialog title="选题输入渠道" onClose={() => setModal(false)}>
          <p className="dialog-intro">
            修改项目中的 config/选题输入渠道.md 后刷新。停用渠道只影响下次生成，不清除已有记录。
          </p>
          <pre className="channel-document" tabIndex={0}>
            {channelDocument}
          </pre>
        </Dialog>
      )}
    </main>
  );
}
