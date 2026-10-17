'use client';

import { useEffect, useState } from 'react';
import type { Parameters } from '@/lib/config';
import type { TopicChannel } from '@/lib/topic-channels';
import { topicDemo, TOPIC_DEMO_DATE, TOPIC_DEMO_SAMPLES, TOPIC_STORAGE_KEY, topicDecisionsSchema, type TopicCandidate, type TopicDecision, type TopicDecisions } from '@/lib/topic-demo';
import { number } from '@/lib/format';
import { Button, Card, Dialog, Empty, Segmented, Tag } from '@/ui/components';
import { WorkspaceHeader } from '@/ui/workspace-header';

type StatusFilter = 'candidate' | 'selected' | 'skipped' | 'all';
type KindFilter = 'all' | 'fire' | 'explore';
type Scenario = 'normal' | 'cold' | 'empty';
const statusLabels = { candidate: '候选', selected: '已选中', skipped: '已跳过', all: '全部' };

export default function TopicsPage({ parameters, channels, channelDocument }: { parameters: Parameters; channels: TopicChannel[]; channelDocument: string }) {
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [decisions, setDecisions] = useState<TopicDecisions>({});
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<StatusFilter>('candidate');
  const [kind, setKind] = useState<KindFilter>('all');
  const [channelId, setChannelId] = useState('all');
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState(topicDemo[0].id);
  const [modal, setModal] = useState<'channels' | 'reset' | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOPIC_STORAGE_KEY);
      if (raw) setDecisions(topicDecisionsSchema.parse(JSON.parse(raw)));
    } catch {
      setStorageError('本地演示记录无法读取，旧记录未覆盖。可以重置本页演示后继续。');
    }
    setReady(true);
  }, []);

  const enabled = channels.filter(channel => channel.enabled);
  const available = topicDemo.filter(topic => enabled.some(channel => channel.id === topic.channelId));
  const explorationCount = Math.min(parameters.topicExploreMax, available.filter(topic => topic.exploration).length);
  const regular = available.filter(topic => !topic.exploration).slice(0, parameters.topicCandidateCount - explorationCount);
  const exploration = available.filter(topic => topic.exploration).slice(0, explorationCount);
  const batch = scenario === 'empty' ? [] : available.filter(topic => regular.includes(topic) || exploration.includes(topic));
  const sampleCount = scenario === 'empty' ? 0 : scenario === 'cold' ? Math.min(12, parameters.topicFireMinimum - 1) : TOPIC_DEMO_SAMPLES;
  const fireEnabled = sampleCount >= parameters.topicFireMinimum;
  const topicStatus = (topic: TopicCandidate) => decisions[topic.id]?.status ?? 'candidate';
  const isFire = (topic: TopicCandidate) => decisions[topic.id]?.frozenFire ?? (fireEnabled && topic.evidence !== null);
  const recommendation = (topic: TopicCandidate) => decisions[topic.id]?.selectedAt
    ? decisions[topic.id].frozenReason
    : fireEnabled ? topic.evidence?.reason : null;
  const savedTopics = topicDemo.filter(topic => decisions[topic.id]?.status === 'selected');
  const skippedTopics = topicDemo.filter(topic => decisions[topic.id]?.status === 'skipped');
  const candidates = batch.filter(topic => topicStatus(topic) === 'candidate');
  const base = scenario === 'empty' ? [] : status === 'selected' ? savedTopics : status === 'skipped' ? skippedTopics : status === 'all' ? topicDemo.filter(topic => batch.includes(topic) || decisions[topic.id]) : candidates;
  const visible = base.filter(topic => (channelId === 'all' || topic.channelId === channelId)
    && (kind === 'all' || (kind === 'fire' ? isFire(topic) : topic.exploration))
    && `${topic.title} ${topic.direction} ${topic.signal}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const focused = visible.find(topic => topic.id === focusId) ?? visible[0];
  const focusedDecision = focused ? decisions[focused.id] : undefined;
  const source = focused ? channels.find(channel => channel.id === focused.channelId) : undefined;
  const frozen = focusedDecision?.selectedAt != null;
  const persistedCount = scenario === 'empty' ? 0 : savedTopics.length;
  const canChange = ready && !storageError && scenario !== 'empty';

  function updateTopic(topic: TopicCandidate, nextStatus: TopicDecision['status']) {
    if (!canChange) return;
    const existing = decisions[topic.id];
    const firstSelection = nextStatus === 'selected' && existing?.selectedAt == null;
    const marked = firstSelection ? fireEnabled && topic.evidence !== null : existing?.frozenFire ?? null;
    const decision: TopicDecision = {
      status: nextStatus, frozenFire: marked,
      frozenReason: firstSelection ? (marked ? topic.evidence!.reason : '选中时未标记 FIRE；该记录不会随样本或筛选变化而改变。') : existing?.frozenReason ?? null,
      selectedAt: firstSelection ? new Date().toISOString() : existing?.selectedAt ?? null,
    };
    const next = { ...decisions, [topic.id]: decision };
    setDecisions(next);
    try {
      localStorage.setItem(TOPIC_STORAGE_KEY, JSON.stringify(next));
      setNotice(`${topic.title} · ${statusLabels[nextStatus]}，已保存在本浏览器演示记录中。`);
    } catch {
      setStorageError('浏览器保存失败，本轮改动仅暂存于当前页面，刷新后可能丢失。请检查浏览器存储设置。');
    }
  }
  function resetDemo() {
    try {
      localStorage.setItem(TOPIC_STORAGE_KEY, '{}');
      setDecisions({}); setStorageError(''); setNotice('本页演示记录已重置。'); setModal(null);
      setStatus('candidate'); setKind('all'); setQuery(''); setChannelId('all');
    } catch { setStorageError('重置失败，浏览器存储不可用。旧记录未删除。'); setModal(null); }
  }
  function changeScenario(value: Scenario) {
    setScenario(value); setStatus('candidate'); setKind('all'); setQuery(''); setChannelId('all'); setNotice('');
  }
  const countLabel = (value: number) => ready ? String(value).padStart(2, '0') : '--';

  return <main className="workspace topics-workspace">
    <WorkspaceHeader current="/topics" date={TOPIC_DEMO_DATE} syncWindow={parameters.syncWindow} />
    <div className="modebar"><p><span className="mode-label mono">{scenario === 'empty' ? 'PREVIEW' : 'DEMO'}</span>{scenario === 'empty' ? '无数据预览 · 不清除已保存的演示选择' : '演示候选与历史表现 · 选择仅保存在本浏览器'}</p><Segmented<Scenario> label="选题数据场景" value={scenario} onChange={changeScenario} options={[{ value: 'normal', label: '演示数据' }, { value: 'cold', label: '样本不足' }, { value: 'empty', label: '无数据' }]} /></div>
    <div className="topics-heading"><div><span className="eyebrow">TOPIC DISCOVERY</span><h1>选题中心<span className="heading-separator">/</span><span>下一条，做什么？</span></h1></div><div className="topic-generation"><span className="small">AI 推荐服务待接入</span><Button className="selected" disabled title="当前仅展示固定示例，不调用 AI">生成 {parameters.topicCandidateCount} 个候选</Button></div></div>
    <section className="card topic-summary" aria-label="本批选题概况"><div className="topic-summary-intro"><span className="eyebrow">00 · THIS BATCH</span><p>本批候选</p><small>示例批次 · <span className="mono">{TOPIC_DEMO_DATE.slice(5)}</span></small></div><div className="topic-summary-item"><strong className="mono">{countLabel(candidates.length)}</strong><span>待筛选 <small>/ {batch.length} 个候选</small></span></div><div className="topic-summary-item"><strong className="mono">{countLabel(persistedCount)}</strong><span>已选中 <small>/ 浏览器记录</small></span></div><div className="topic-summary-item"><strong className="mono">{countLabel(batch.filter(topic => topic.exploration).length)}</strong><span>探索位 <small>/ {parameters.topicExploreMin}–{parameters.topicExploreMax} 个</small></span></div><div className="topic-summary-item"><strong className="mono">{countLabel(batch.filter(isFire).length)}</strong><span>FIRE 标记 <small>/ 含选中时定格</small></span></div><div className="topic-summary-note"><span className="eyebrow">PREFERENCE → DIRECTION</span><p>偏好决定推什么<br/>表现决定标什么</p></div></section>
    <div className="topic-feedback" role="status" aria-live="polite">{storageError || notice || (scenario !== 'empty' && (batch.length < parameters.topicCandidateCount || explorationCount < parameters.topicExploreMin) ? `当前可用演示样本 ${batch.length} 条，探索位 ${explorationCount} 条；不足配置数量，不补造候选。` : '选择候选前，先看看原始线索和推荐依据。')}</div>
    <div className="topics-grid">
      <aside className="topic-sidebar">
        <Card index="01" title="输入渠道" meta={<span className="eyebrow">{enabled.length} ON</span>}><button className={`channel-filter ${channelId === 'all' ? 'active' : ''}`} aria-pressed={channelId === 'all'} onClick={() => setChannelId('all')}><span>全部渠道</span><span className="mono">{batch.length}</span></button>{channels.map(channel => <button key={channel.id} className={`channel-filter ${channelId === channel.id ? 'active' : ''}`} aria-pressed={channelId === channel.id} onClick={() => setChannelId(channel.id)}><span><b>{channel.name}</b><small>{channel.enabled ? channel.type : '已停用 · 不参与新候选'}</small></span><span className="mono">{batch.filter(topic => topic.channelId === channel.id).length}</span></button>)}<div className="channel-config"><p className="small">外部渠道 {channels.filter(channel => channel.kind === 'external').length} 个 · 在渠道文档中增删</p><Button onClick={() => setModal('channels')}>查看渠道文档 ↗</Button></div></Card>
        <Card index="04" title="FIRE 开启条件"><div className="sample-count"><strong className="mono">{number(sampleCount)}</strong><span className="mono">/ {parameters.topicFireMinimum}</span></div><p className="small">抖音有 D21 结果的作品（演示）</p><div className="sample-track" role="progressbar" aria-label="FIRE 开启样本进度" aria-valuemin={0} aria-valuemax={parameters.topicFireMinimum} aria-valuenow={Math.min(sampleCount, parameters.topicFireMinimum)}><span style={{ width: `${Math.min(100, sampleCount / parameters.topicFireMinimum * 100)}%` }} /></div><p className="sample-status">{fireEnabled ? '已达到开启门槛' : `还差 ${Math.max(0, parameters.topicFireMinimum - sampleCount)} 条 D21 结果`}</p><p className="small topic-rule">未达到门槛时仍可选题，候选不新增 FIRE 标记。已定格记录保留。</p></Card>
      </aside>
      <Card index="02" title="候选方向" meta={<span className="eyebrow">{visible.length} ITEMS</span>} className="topic-list-card">
        <div className="topic-status-tabs"><Segmented<StatusFilter> label="选题状态" value={status} onChange={setStatus} options={[{ value: 'candidate', label: `候选 ${countLabel(candidates.length)}` }, { value: 'selected', label: `已选中 ${countLabel(persistedCount)}` }, { value: 'skipped', label: `已跳过 ${countLabel(scenario === 'empty' ? 0 : skippedTopics.length)}` }, { value: 'all', label: '全部' }]} /></div>
        <div className="topic-search"><label htmlFor="topic-search" className="sr-only">搜索选题或原始线索</label><input id="topic-search" type="search" placeholder="搜索方向或原始线索" value={query} onChange={event => setQuery(event.target.value)} /><Segmented<KindFilter> label="选题类型" value={kind} onChange={setKind} options={[{ value: 'all', label: '全部' }, { value: 'fire', label: 'FIRE' }, { value: 'explore', label: '探索' }]} /></div>
        <div className="topic-list" aria-label="候选选题列表">{visible.map(topic => <article className={`topic-row ${focused?.id === topic.id ? 'focused' : ''}`} key={topic.id} data-topic-id={topic.id}>
          <span className="topic-number mono">{String(topicDemo.indexOf(topic) + 1).padStart(2, '0')}</span><div className="topic-row-content"><div className="topic-row-title"><button className="topic-title" aria-pressed={focused?.id === topic.id} onClick={() => setFocusId(topic.id)}>{topic.title}</button>{isFire(topic) && <Tag>FIRE</Tag>}{topic.exploration && <Tag outline>EXPLORE</Tag>}</div><p className="topic-direction">{topic.direction}</p><div className="topic-row-footer"><span>{channels.find(channel => channel.id === topic.channelId)?.name ?? '来源渠道已移除'}</span><div className="topic-row-actions">{topicStatus(topic) === 'candidate' ? <><Button disabled={!canChange} onClick={() => updateTopic(topic, 'skipped')}>跳过</Button><Button className="selected" disabled={!canChange} onClick={() => updateTopic(topic, 'selected')}>选中</Button></> : <><span className="decision-label">{statusLabels[topicStatus(topic)]}</span><Button disabled={!canChange} onClick={() => updateTopic(topic, 'candidate')}>移回候选</Button></>}</div></div></div>
        </article>)}{visible.length === 0 && <Empty>{scenario === 'empty' ? '暂无候选，等待接入选题服务' : '没有符合当前筛选条件的选题'}</Empty>}</div>
        <div className="topic-list-bottom"><span>方向来自历史偏好 · 探索位保留新可能</span><Button className="text-button" onClick={() => { setQuery(''); setKind('all'); setChannelId('all'); setStatus('candidate'); }}>清除筛选</Button></div>
      </Card>
      <aside className="topic-detail-column">
        <Card index="03" title="选题依据" meta={focused && <span className="eyebrow">NO. {String(topicDemo.indexOf(focused) + 1).padStart(2, '0')}</span>} className="topic-detail-card">{focused ? <>
          <div className="detail-topic-tags">{isFire(focused) && <Tag>FIRE</Tag>}{focused.exploration && <Tag outline>EXPLORE</Tag>}<span className="small">{frozen ? '首次选中时已定格' : '尚未选中'}</span></div><h3>{focused.title}</h3><p className="detail-direction">{focused.direction}</p>
          <div className="topic-detail-section"><h4 className="eyebrow">SOURCE · 原始线索</h4><blockquote>“{focused.signal}”</blockquote><p className="small">{source?.name ?? '来源渠道已移除'} · {focused.sourceContext}</p><dl className="topic-source-meta"><div><dt>采集位置</dt><dd>{source?.location ?? '--'}</dd></div><div><dt>原始链接</dt><dd>-- <span className="small">真实采集待接入</span></dd></div></dl></div>
          <div className="topic-detail-section"><h4 className="eyebrow">EVIDENCE · 推荐依据</h4>{recommendation(focused) ? <><p className="topic-evidence">{recommendation(focused)}</p>{isFire(focused) && focused.evidence && <div className="evidence-numbers"><div><strong className="mono">{number(focused.evidence.d21, 1)}×</strong><span>D21 平均倍数</span></div><div><strong className="mono">{focused.evidence.count}</strong><span>同类历史作品</span></div></div>}</> : <p className="small topic-rule">{!fireEnabled ? `当前样本不足 ${parameters.topicFireMinimum} 条，仅展示方向，不新增 FIRE 判断。` : focused.exploration ? '这是未做过的新方向示例。近期热度尚未验证，接入真实来源后才能判断。' : '方向来自历史偏好与观众问题；当前没有足够的同类表现依据，不标记 FIRE。'}</p>}<p className="evidence-note small">历史表现和线索均为演示，不是实际调研结果。</p></div>
          <div className="detail-topic-actions">{topicStatus(focused) === 'selected' ? <Button disabled={!canChange} onClick={() => updateTopic(focused, 'candidate')}>移回候选</Button> : <Button className="selected" disabled={!canChange} onClick={() => updateTopic(focused, 'selected')}>选中这个方向</Button>}<span className="small">{frozen ? '保留首次定格记录' : '选中时定格 FIRE 标记'}</span></div>
        </> : <Empty>选择一个候选，查看来源与依据</Empty>}</Card>
        <Card index="05" title="已选清单" meta={<span className="eyebrow">{countLabel(persistedCount)} PICKED</span>} className="topic-picked-card">{persistedCount ? <div className="picked-list">{savedTopics.map(topic => <button key={topic.id} onClick={() => { setStatus('selected'); setKind('all'); setChannelId('all'); setQuery(''); setFocusId(topic.id); }}><span>{topic.title}</span>{isFire(topic) && <Tag>FIRE</Tag>}<span aria-hidden="true">↗</span></button>)}</div> : <Empty>还没有选中的方向</Empty>}<p className="small">制作环节尚未接入，可先在这里保留选择。</p></Card>
      </aside>
    </div>
    <footer className="footer"><span className="mono">WILDMIND / TOPIC DISCOVERY</span><span>演示状态仅保存在本浏览器<span className="footer-divider">/</span><Button className="text-button" onClick={() => setModal('reset')}>重置本页演示</Button></span></footer>
    {modal === 'channels' && <Dialog title="选题输入渠道" onClose={() => setModal(null)}><p className="dialog-intro">修改项目中的 config/选题输入渠道.md 后刷新页面。内置渠道只开关，外部渠道可增删；当前未执行采集。</p><pre className="channel-document" tabIndex={0}>{channelDocument}</pre></Dialog>}
    {modal === 'reset' && <Dialog title="重置本页演示记录" onClose={() => setModal(null)}><p className="dialog-intro">将清空这个浏览器中已选中、已跳过及 FIRE 定格的演示记录，回到未筛选状态。总控台和项目配置不受影响。</p><div className="reset-actions"><Button onClick={() => setModal(null)}>保留记录</Button><Button className="selected" onClick={resetDemo}>确认重置演示</Button></div></Dialog>}
  </main>;
}
