'use client';
import { TopicSkillEditor } from '@/ui/topic-skill-editor';
import { ArchiveButton } from '@/ui/archive-controls';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TopicGenerationStatus } from '@/ui/topic-generation-status';
import type { Parameters, Platform } from '@/lib/config';
import type { TopicChannel } from '@/lib/topic-channels';
import {
  filterTopics,
  topicFire,
  topicEvidence,
  topicStatusLabels,
  type Topic,
  type TopicData,
} from '@/lib/topic-model';
import { inboxTime } from '@/lib/inbox-model';
import { PageHeader, Button, Card, Empty, Segmented } from '@/ui/components';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { request, useResource } from '@/ui/use-resource';
type StatusFilter = 'candidate' | 'selected' | 'skipped' | 'published' | 'all';
type KindFilter = 'all' | 'fire' | 'explore';
const humanText = (text: string) =>
  text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, (value) => inboxTime(value))
    .replaceAll('history为空', '暂时没有历史记录');
export default function TopicsPage({
  parameters,
  channels = [],
  platforms,
  initialData,
  today,
}: {
  parameters: Parameters;
  channels?: TopicChannel[];
  platforms: Platform[];
  initialData: TopicData;
  today: string;
}) {
  const [skillState, setSkillState] = useState({ pending: true, revision: '' });
  const updateSkillState = useCallback((value: { pending: boolean; revision: string }) => setSkillState(value), []);
  const [skillRefresh, setSkillRefresh] = useState(0);
  const { data, error, refresh } = useResource('/api/topics', initialData, true);
  const {
    data: taskData,
    error: taskError,
    refresh: refreshTask,
  } = useResource('/api/topics/generate', { task: initialData.generation ?? null }, true);
  const [status, setStatus] = useState<StatusFilter>('candidate');
  const [kind, setKind] = useState<KindFilter>('all');
  const [channelId, setChannelId] = useState('all');
  const [query, setQuery] = useState('');
  const [focusId, setFocusId] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const generating = taskData.task?.status === 'queued' || taskData.task?.status === 'running';
  useEffect(() => {
    const timer = setInterval(() => void refreshTask(), parameters.topicPollMs);
    return () => clearInterval(timer);
  }, [refreshTask, parameters.topicPollMs]);
  const lastCompleted = useRef(initialData.generation?.status === 'completed' ? initialData.generation.id : '');
  useEffect(() => {
    if (taskData.task?.status === 'completed' && taskData.task.id !== lastCompleted.current) {
      lastCompleted.current = taskData.task.id;
      void refresh();
    }
  }, [taskData.task, refresh]);
  const fireEnabled = data.d21Samples !== null && data.d21Samples >= parameters.topicFireMinimum;
  const topics = data.topics;
  const visible = filterTopics(topics, status, kind, channelId, query, fireEnabled);
  const channelScope = filterTopics(topics, status, kind, 'all', query, fireEnabled);
  const kindScope = filterTopics(topics, status, 'all', channelId, query, fireEnabled);
  const focused = visible.find((t) => t.id === focusId);
  const evidence = focused ? topicEvidence(focused, fireEnabled) : null;
  const exhausted = status === 'candidate' && !topics.some((t) => t.status === 'candidate');
  const selectedTopic = topics.find((t) => t.status === 'selected');
  const candidateCount = topics.filter((t) => t.status === 'candidate').length;
  const sourceName = (id: string) =>
    ({
      topic_skill: 'Skill 找题',
      open_discovery: '主动发现',
      search_keywords: '抖音搜索词',
      followup_search: '看后搜',
    })[id] ??
    channels.find((c) => c.id === id)?.name ??
    platforms.find((p) => p.id === id)?.name ??
    '历史来源';
  const sourceIds = [...new Set([...channels.map((c) => c.id), ...topics.map((t) => t.channelId)])];
  const canChange = data.writeReady && !busy;
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
      if (nextStatus === 'selected') {
        setStatus('selected');
        setKind('all');
        setChannelId('all');
        setQuery('');
        setFocusId(topic.id);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '保存失败，未更改选择');
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  async function generate(resumeFrom?: string) {
    if (!data.generationReady || busy || starting || generating || (!resumeFrom && skillState.pending)) return;
    setStarting(true);
    setNotice('');
    try {
      await request('/api/topics/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resumeFrom ? { resumeFrom } : { revision: skillState.revision }),
      });
      await refreshTask();
      setNotice('');
      setStatus('candidate');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '生成失败');
    } finally {
      await refreshTask();
      setStarting(false);
    }
  }
  const generateButton = (
    <Button
      variant="primary"
      disabled={!data.generationReady || busy || starting || generating || skillState.pending}
      disabledReason={
        skillState.pending
          ? '请先读取并保存 Skill 的修改。'
          : !data.generationReady
            ? '目前无法生成候选，请稍后再试。'
            : '正在处理，请稍候。'
      }
      onClick={() => void generate()}
    >
      {starting ? '正在启动…' : generating ? '正在找题…' : '按 Skill 找选题'}
    </Button>
  );
  return (
    <main className="workspace topics-workspace topics-v2 topics-skill-page">
      <WorkspaceHeader current="/topics" date={today} syncWindow={parameters.syncWindow} />
      <PageHeader
        title="选题"
        summary={
          candidateCount
            ? '挑出你愿意点开看的题'
            : selectedTopic
              ? '生成下一批候选，或继续已选方向'
              : '生成下一批候选，挑选新的方向'
        }
        onRefresh={() => {
          void refresh();
          void refreshTask();
          setSkillRefresh((value) => value + 1);
        }}
        action={generateButton}
      />
      {(notice || error || taskError) && <p role="status">{error || taskError || notice}</p>}
      <div className="topics-channel-layout">
        <aside className="topics-channel-sidebar">
          <TopicSkillEditor onState={updateSkillState} refreshKey={skillRefresh} />
        </aside>
        <div className={`topics-v2-grid ${!focused ? 'topics-no-detail' : ''}`}>
          <TopicGenerationStatus
            task={taskData.task}
            starting={starting}
            onRecover={() => void generate(taskData.task?.id)}
          />
          <Card title="候选方向" className="topic-list-card">
            {exhausted && selectedTopic && (
              <Link href={`/images?topic=${encodeURIComponent(selectedTopic.id)}`}>
                继续已选方向：{selectedTopic.title} →
              </Link>
            )}
            {topics.length > 0 && (
              <>
                <Segmented<StatusFilter>
                  label="选题状态"
                  value={status}
                  onChange={(value) => {
                    setStatus(value);
                    setChannelId('all');
                    setKind('all');
                    setQuery('');
                  }}
                  options={[
                    ...(['candidate', 'selected', 'skipped', 'published'] as const).map((value) => ({
                      value,
                      label: `${topicStatusLabels[value]} ${topics.filter((t) => t.status === value).length}`,
                    })),
                    { value: 'all', label: `全部 ${topics.length}` },
                  ]}
                />
                <div className="topic-channel-row" role="group" aria-label="输入渠道">
                  <Button aria-pressed={channelId === 'all'} onClick={() => setChannelId('all')}>
                    本范围来源 {channelScope.length}
                  </Button>
                  {sourceIds
                    .filter((id) => channelScope.some((t) => t.channelId === id))
                    .map((id) => (
                      <Button key={id} aria-pressed={channelId === id} onClick={() => setChannelId(id)}>
                        {sourceName(id)} {channelScope.filter((t) => t.channelId === id).length}
                      </Button>
                    ))}
                </div>
                <div className="topic-search">
                  <input
                    aria-label="搜索选题"
                    placeholder="搜索方向或线索"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Segmented<KindFilter>
                    label="选题类型"
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: 'all', label: `全部 ${kindScope.length}` },
                      {
                        value: 'fire',
                        label: `历史表现支持 ${kindScope.filter((t) => topicFire(t, fireEnabled)).length}`,
                      },
                      { value: 'explore', label: `探索 ${kindScope.filter((t) => t.exploration).length}` },
                    ]}
                  />
                </div>
                <div className="topic-list" aria-label="候选选题列表">
                  {visible.map((topic) => (
                    <article
                      className={`topic-row ${focused?.id === topic.id ? 'focused' : ''}`}
                      key={topic.id}
                      data-topic-id={topic.id}
                    >
                      <div className="topic-row-content">
                        {topic.channelId === 'topic_skill' && (
                          <p className="topic-entity">
                            <b>实体</b>
                            {topic.direction}
                          </p>
                        )}
                        <div className="topic-row-title">
                          <button
                            className="topic-title list-row"
                            aria-expanded={focused?.id === topic.id}
                            onClick={() => setFocusId(focused?.id === topic.id ? '' : topic.id)}
                          >
                            {topic.channelId === 'topic_skill' && <b className="topic-field-label">角度</b>}
                            {topic.title} →
                          </button>
                          <div className="topic-row-actions">
                            <ArchiveButton kind="topic" id={topic.id} />
                            {topic.status === 'candidate' ? (
                              <>
                                <Button
                                  disabled={!canChange}
                                  disabledReason="当前无法保存，请稍后再试。"
                                  onClick={() => void updateTopic(topic, 'selected')}
                                >
                                  想看
                                </Button>
                                <Button
                                  disabled={!canChange}
                                  disabledReason="当前无法保存，请稍后再试。"
                                  onClick={() => void updateTopic(topic, 'skipped')}
                                >
                                  无感
                                </Button>
                              </>
                            ) : (
                              <>
                                <span>{topicStatusLabels[topic.status]}</span>
                                {topic.status !== 'published' && (
                                  <Button
                                    disabled={!canChange}
                                    disabledReason="当前无法保存，请稍后再试。"
                                    onClick={() => void updateTopic(topic, 'candidate')}
                                  >
                                    移回候选
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                        {topic.status === 'selected' && (
                          <Link href={`/images?topic=${encodeURIComponent(topic.id)}`}>用此选题制作封面 →</Link>
                        )}
                      </div>
                    </article>
                  ))}
                  {!visible.length && (
                    <Empty>
                      {status === 'candidate' && taskData.task?.status === 'failed'
                        ? '本轮找题中断，尚未生成候选'
                        : topics.length
                          ? '当前筛选没有方向，换个筛选看看'
                          : '暂无候选，生成后显示'}
                    </Empty>
                  )}
                </div>
              </>
            )}
          </Card>
          {focused && (
            <aside>
              <Card title="选题依据">
                {focused ? (
                  <>
                    <h3>{focused.title}</h3>
                    <p>
                      {sourceName(focused.channelId)}
                      {focused.exploration ? ' · 探索方向' : ''}
                    </p>
                    <p>{humanText(focused.direction)}</p>
                    <h4>原始线索</h4>
                    <blockquote>{humanText(focused.signal)}</blockquote>
                    <p>{humanText(focused.sourceContext)}</p>
                    {focused.sourceUrl && (
                      <a href={focused.sourceUrl} target="_blank" rel="noreferrer">
                        查看原始来源 →
                      </a>
                    )}
                    {evidence && (
                      <p>
                        {humanText(evidence.reason)} · 同类 {evidence.count} 条，D21 平均 {evidence.d21.toFixed(1)} 倍
                      </p>
                    )}
                  </>
                ) : (
                  <p>还没有可查看的方向，生成候选后显示依据</p>
                )}
              </Card>
              <div className="card collapsed-note">
                {fireEnabled
                  ? '历史表现推荐已开启'
                  : `历史推荐：还差 ${Math.max(0, parameters.topicFireMinimum - (data.d21Samples ?? 0))} 条 D21 结果`}
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
