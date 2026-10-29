'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreationStageNav } from './creation-shell';
import type { ImageConfig, ImageData } from '@/lib/image-model';
import type { ImageConversation } from '@/lib/image-conversations';
import { AssetImage } from './asset-image';
import { Button, Dialog } from './components';
import { WorkspaceHeader } from './workspace-header';
import { request, useResource } from './use-resource';

type Skill = { id: string; name: string; description: string };
type Turn = {
  id: string;
  input: string;
  output: string;
  error: string | null;
  status: string;
  assetIds: string[];
  skillName?: string | null;
  ratio?: string;
};
type Draft = { text: string; skillId: string; ratio: string };
type Saved = { active: string; drafts: Record<string, Draft> };
const key = 'wildmind-image-conversations';
const blank = (): Draft => ({ text: '', skillId: '', ratio: '' });
const uuid = (id: unknown): id is string =>
  typeof id === 'string' && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id);
export function ImageChatStudio({
  config,
  initialData,
  today,
  syncWindow,
}: {
  config: ImageConfig;
  initialData: ImageData;
  today: string;
  syncWindow: string;
}) {
  const query = useSearchParams();
  const { data, refresh, error: resourceError } = useResource('/api/images', initialData);
  const [sessions, setSessions] = useState<ImageConversation[]>([]);
  const [active, setActive] = useState('');
  const activeRef = useRef('');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [turns, setTurns] = useState<Turn[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busySession, setBusySession] = useState('');
  const pending = useRef<(Turn & { sessionId: string }) | null>(null);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [rename, setRename] = useState<{ id: string; title: string } | null>(null);
  const sequence = useRef(0);
  const sessionsSequence = useRef(0);
  const history = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const draft = drafts[active] ?? blank();
  const current = sessions.find((s) => s.id === active);
  const running = !!busySession || sessions.some((s) => s.running);
  const ratios = [...new Set(config.purposes.flatMap((p) => p.ratios))];
  const purpose = config.purposes.find((p) => p.contentMode === 'free')!;
  function activate(id: string) {
    if (activeRef.current === id) return;
    activeRef.current = id;
    sequence.current++;
    setActive(id);
    setTurns([]);
    setError('');
    setLoading(true);
    nearBottom.current = true;
  }
  async function loadSessions() {
    const ticket = ++sessionsSequence.current;
    const result = await request<{ sessions: ImageConversation[] }>('/api/images/chat/sessions');
    if (ticket === sessionsSequence.current) setSessions(result.sessions);
    return result.sessions;
  }
  async function loadConversation(id: string) {
    const ticket = ++sequence.current;
    const result = await request<{ turns: Turn[]; skills: Skill[] }>('/api/images/chat?session=' + id);
    if (activeRef.current !== id || ticket !== sequence.current) return;
    const live = pending.current?.sessionId === id ? pending.current : null;
    setTurns(live ? [...result.turns.filter((t) => t.id !== live.id), live] : result.turns);
    setSkills(result.skills);
    setLoading(false);
  }
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const result = await request<{ sessions: ImageConversation[] }>('/api/images/chat/sessions');
        if (!live) return;
        let saved: Saved | null = null;
        try {
          const raw = JSON.parse(localStorage.getItem(key) ?? 'null');
          if (uuid(raw?.active) && raw?.drafts && typeof raw.drafts === 'object') {
            const valid = Object.fromEntries(
              Object.entries(raw.drafts).filter(([id, value]) => {
                const d = value as Draft;
                return (
                  uuid(id) && d && ['text', 'skillId', 'ratio'].every((k) => typeof d[k as keyof Draft] === 'string')
                );
              }),
            );
            saved = { active: raw.active, drafts: valid as Record<string, Draft> };
          } else {
            const old = JSON.parse(localStorage.getItem('wildmind-video-cover-chat') ?? 'null');
            if (uuid(old?.sessionId))
              saved = {
                active: old.sessionId,
                drafts: {
                  [old.sessionId]: {
                    text: typeof old.text === 'string' ? old.text : '',
                    skillId: typeof old.skillId === 'string' ? old.skillId : '',
                    ratio: '',
                  },
                },
              };
          }
        } catch {
          /* Retain server history if a browser draft is damaged. */
        }
        setSessions(result.sessions);
        setDrafts(saved?.drafts ?? {});
        const id = saved?.active ?? result.sessions.find((s) => !s.archived)?.id ?? crypto.randomUUID();
        setArchived(result.sessions.find((s) => s.id === id)?.archived ?? false);
        activate(id);
      } catch (e) {
        if (live) {
          setError(String(e));
          setLoading(false);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (!active) return;
    try {
      localStorage.setItem(key, JSON.stringify({ active, drafts }));
    } catch {
      setError('未能保存输入草稿，请保留提示词后再离开。');
    }
  }, [active, drafts]);
  useEffect(() => {
    if (active)
      void loadConversation(active).catch((e) => {
        if (activeRef.current === active) {
          setError(String(e));
          setLoading(false);
        }
      });
  }, [active]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void Promise.all([
        loadSessions(),
        activeRef.current ? loadConversation(activeRef.current) : Promise.resolve(),
        refresh(),
      ]).catch((e) => setError(String(e)));
    }, 3000);
    return () => clearInterval(timer);
  }, [running, refresh]);
  useEffect(() => {
    const node = history.current;
    if (node && nearBottom.current) node.scrollTop = node.scrollHeight;
  }, [turns, active, data.assets]);
  function edit(change: Partial<Draft>) {
    setDrafts((all) => ({ ...all, [active]: { ...(all[active] ?? blank()), ...change } }));
  }
  async function manage(action: 'create' | 'rename' | 'archive' | 'restore', id: string, title?: string) {
    setMutating(true);
    setError('');
    try {
      await request('/api/images/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id, ...(title === undefined ? {} : { title }) }),
      });
      const next = await loadSessions();
      if (action === 'create') {
        setArchived(false);
        setSearch('');
        activate(id);
      }
      if (action === 'rename') setRename(null);
      if (action === 'archive' && activeRef.current === id)
        activate(next.find((s) => !s.archived)?.id ?? crypto.randomUUID());
      if (action === 'restore') {
        setArchived(false);
        activate(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setMutating(false);
    }
  }
  async function send() {
    if (!active || !draft.text.trim() || running || current?.archived || pending.current) return;
    const sessionId = active,
      snapshot = { ...draft },
      id = crypto.randomUUID();
    const optimistic: Turn & { sessionId: string } = {
      id,
      sessionId,
      input: snapshot.text,
      output: '',
      status: 'running',
      error: null,
      assetIds: [],
      skillName: skills.find((s) => s.id === snapshot.skillId)?.name ?? null,
      ratio: snapshot.ratio,
    };
    pending.current = optimistic;
    setBusySession(sessionId);
    setError('');
    nearBottom.current = true;
    setTurns((old) => [...old, optimistic]);
    setSessions((old) => [
      {
        id: sessionId,
        title: current?.title ?? snapshot.text.trim().split('\n')[0].slice(0, 48),
        archived: false,
        updatedAt: new Date().toISOString(),
        running: true,
      },
      ...old.filter((s) => s.id !== sessionId),
    ]);
    setDrafts((all) => ({ ...all, [sessionId]: { ...snapshot, text: '' } }));
    try {
      const response = await fetch('/api/images/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          sessionId,
          purposeId: purpose.id,
          text: snapshot.text,
          skillId: snapshot.skillId || null,
          ratio: snapshot.ratio,
          referenceIds: [],
        }),
      });
      if (!response.ok || !response.body) throw Error(await response.text());
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '',
        completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const event = JSON.parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          if (event.type === 'text') {
            optimistic.output = event.text;
            if (activeRef.current === sessionId)
              setTurns((old) => old.map((t) => (t.id === id ? { ...optimistic } : t)));
          }
          if (event.type === 'done') completed = true;
          if (event.type === 'error') throw Error(event.error);
        }
      }
      if (!completed) throw Error('连接已中断，请刷新查看结果，不要重复发送。');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (activeRef.current === sessionId) setError(message);
      setDrafts((all) => ({
        ...all,
        [sessionId]: { ...(all[sessionId] ?? snapshot), text: all[sessionId]?.text || snapshot.text },
      }));
    } finally {
      pending.current = null;
      setBusySession('');
      await Promise.all([
        loadSessions(),
        refresh(),
        activeRef.current === sessionId ? loadConversation(sessionId) : Promise.resolve(),
      ]).catch((e) => setError(String(e)));
    }
  }
  const visible = sessions.filter(
    (s) => s.archived === archived && s.title.toLowerCase().includes(search.toLowerCase()),
  );
  const sendingHere = busySession === active || current?.running;
  const disabled =
    !active ||
    loading ||
    !draft.text.trim() ||
    running ||
    current?.archived ||
    !data.generationReady ||
    (!!draft.skillId && !skills.some((s) => s.id === draft.skillId));
  return (
    <main className="workspace image-conversation-workspace">
      <WorkspaceHeader current="/images" date={today} syncWindow={syncWindow} />
      <CreationStageNav
        step="materials"
        query={query.toString()}
        content={data.contents.find((c) => c.id === query.get('content')) ?? null}
      />
      <div className="image-conversation-shell">
        <aside className="image-conversation-sidebar" aria-label="生图对话列表">
          <div className="image-conversation-brand">生图中心</div>
          <Button
            className="image-new-conversation"
            disabled={mutating}
            disabledReason="正在保存"
            onClick={() => void manage('create', crypto.randomUUID())}
          >
            ＋ 新对话
          </Button>
          <input
            className="image-conversation-search"
            aria-label="搜索历史对话"
            placeholder="搜索对话"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="image-history-label">
            <span>{archived ? '已归档' : '历史对话'}</span>
            <button onClick={() => setArchived(!archived)}>{archived ? '返回历史' : '已归档'}</button>
          </div>
          <nav className="image-conversation-list" aria-label={archived ? '已归档对话' : '历史对话'}>
            {visible.map((s) => (
              <div className={`image-conversation-row ${s.id === active ? 'selected' : ''}`} key={s.id}>
                <button
                  className="image-conversation-open"
                  aria-current={s.id === active ? 'true' : undefined}
                  title={s.title}
                  onClick={() => activate(s.id)}
                >
                  <span>{s.title}</span>
                  {s.running && <small>生成中</small>}
                </button>
                <details className="image-conversation-menu">
                  <summary aria-label={`管理对话：${s.title}`}>···</summary>
                  <div>
                    <button
                      disabled={mutating}
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        setRename({ id: s.id, title: s.title });
                      }}
                    >
                      重命名
                    </button>
                    <button
                      disabled={mutating || s.running}
                      onClick={(e) => {
                        e.currentTarget.closest('details')?.removeAttribute('open');
                        void manage(s.archived ? 'restore' : 'archive', s.id);
                      }}
                    >
                      {s.archived ? '恢复对话' : '归档对话'}
                    </button>
                  </div>
                </details>
              </div>
            ))}
            {!visible.length && (
              <p className="small">{search ? '没有匹配的对话' : archived ? '没有已归档对话' : '新建对话，开始生图'}</p>
            )}
          </nav>
        </aside>
        <section className="image-conversation-main" aria-label="生图聊天">
          <header className="image-conversation-heading">
            <h1>{current?.title ?? '新对话'}</h1>
            <Button
              onClick={() =>
                void Promise.all([
                  loadSessions(),
                  active ? loadConversation(active) : Promise.resolve(),
                  refresh(),
                ]).catch((e) => setError(String(e)))
              }
            >
              刷新
            </Button>
          </header>
          <div
            className="image-conversation-messages"
            ref={history}
            onScroll={() => {
              const node = history.current;
              if (node) nearBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 100;
            }}
          >
            <div className="image-conversation-transcript">
              {!turns.length && (
                <div className="image-conversation-welcome">{loading ? '正在读取对话…' : '想生成什么图片？'}</div>
              )}
              {turns.map((turn) => (
                <article className="image-conversation-turn" key={turn.id}>
                  <div className="image-user-message">
                    <pre className="chat-verbatim">{turn.input}</pre>
                    {(turn.skillName || turn.ratio) && (
                      <div className="image-message-options">
                        {[turn.ratio, turn.skillName].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  <div className="image-assistant-message">
                    <span className="image-assistant-name">Codex</span>
                    <pre className="chat-verbatim">{turn.output}</pre>
                    {turn.assetIds.map((id) => {
                      const asset = data.assets.find((a) => a.id === id);
                      return (
                        <figure className="image-chat-result" key={id}>
                          <a href={`/api/images/assets/${id}/file`} target="_blank" rel="noreferrer">
                            <AssetImage
                              src={`/api/images/assets/${id}/file`}
                              alt={asset?.title ?? '生成的图片'}
                              width={asset?.width ?? undefined}
                              height={asset?.height ?? undefined}
                              onLoad={() => {
                                const node = history.current;
                                if (node && nearBottom.current) node.scrollTop = node.scrollHeight;
                              }}
                            />
                          </a>
                          <figcaption>
                            <span className="mono">
                              {asset ? `${asset.ratio} · ${asset.width} × ${asset.height}` : '原图'}
                            </span>
                            <a href={`/api/images/assets/${id}/file`} download>
                              下载原图 →
                            </a>
                          </figcaption>
                        </figure>
                      );
                    })}
                    {turn.status === 'running' && (
                      <p className="image-chat-progress" role="status">
                        正在生成…
                      </p>
                    )}
                    {turn.error && (
                      <pre className="chat-verbatim image-chat-error" role="alert">
                        {turn.error}
                      </pre>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="image-composer-area">
            {(error || resourceError) && (
              <p className="image-chat-error" role="alert">
                {error || resourceError}
              </p>
            )}
            {current?.archived ? (
              <div className="image-archived-composer">
                <span>这条对话已归档</span>
                <Button onClick={() => void manage('restore', active)}>恢复对话</Button>
              </div>
            ) : (
              <form
                className="image-chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!disabled) void send();
                }}
              >
                <div className="image-composer-options">
                  <div className="image-ratio-shortcuts" role="group" aria-label="图片比例">
                    <button type="button" aria-pressed={!draft.ratio} onClick={() => edit({ ratio: '' })}>
                      自动
                    </button>
                    {ratios.map((ratio) => (
                      <button
                        className="mono"
                        type="button"
                        key={ratio}
                        aria-pressed={draft.ratio === ratio}
                        onClick={() => edit({ ratio })}
                      >
                        {ratio}
                      </button>
                    ))}
                  </div>
                  <label className="image-composer-skill">
                    <span>技能</span>
                    <select
                      aria-label="选择技能"
                      value={draft.skillId}
                      onChange={(e) => edit({ skillId: e.target.value })}
                    >
                      <option value="">不使用技能</option>
                      {skills.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <textarea
                  aria-label="图片提示词"
                  placeholder="描述你想要的图片，或继续提出修改要求…"
                  value={draft.text}
                  maxLength={20000}
                  disabled={!active}
                  onChange={(e) => edit({ text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      if (!disabled) void send();
                    }
                  }}
                  rows={3}
                />
                <div className="image-composer-footer">
                  <span className="small">
                    {sendingHere
                      ? 'Codex 正在处理这条对话'
                      : running
                        ? '另一条对话正在生成，可先写好提示词'
                        : 'Enter 发送 · Shift + Enter 换行'}
                  </span>
                  <Button
                    variant="primary"
                    type="submit"
                    disabled={!!disabled}
                    disabledReason={running ? '正在生成，请稍候' : '请输入提示词并选择可用技能'}
                    aria-label="发送消息"
                  >
                    ↑
                  </Button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
      {rename && (
        <Dialog title="重命名对话" onClose={() => setRename(null)}>
          <form
            className="image-rename-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (rename?.title.trim()) void manage('rename', rename.id, rename.title);
            }}
          >
            <input
              autoFocus
              aria-label="对话名称"
              maxLength={100}
              value={rename?.title ?? ''}
              onChange={(e) => setRename((r) => (r ? { ...r, title: e.target.value } : r))}
            />
            <Button type="submit" disabled={mutating || !rename?.title.trim()} disabledReason="请输入对话名称">
              保存名称
            </Button>
          </form>
        </Dialog>
      )}
    </main>
  );
}
