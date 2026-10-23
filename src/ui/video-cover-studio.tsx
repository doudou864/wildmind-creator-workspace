'use client';
import { useEffect, useState } from 'react';
import type { ImageConfig, ImageData } from '@/lib/image-model';
import { AssetImage } from './asset-image';
import { Button, Card, Empty, PageHeader } from './components';
import { WorkspaceHeader } from './workspace-header';
import { request } from './use-resource';

type Skill = { id: string; name: string; description: string };
type Turn = {
  id: string;
  input: string;
  output: string;
  error: string | null;
  status: string;
  assetIds: string[];
  skillName?: string | null;
};
type Draft = { sessionId: string; text: string; skillId: string | null };
const storageKey = 'wildmind-video-cover-chat';
export function VideoCoverStudio({
  config,
  data,
  today,
  syncWindow,
  refresh,
  onPurpose,
}: {
  config: ImageConfig;
  data: ImageData;
  today: string;
  syncWindow: string;
  refresh: () => Promise<unknown>;
  onPurpose: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (
        saved &&
        typeof saved.sessionId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(saved.sessionId) &&
        typeof saved.text === 'string' &&
        (saved.skillId === null || typeof saved.skillId === 'string')
      ) {
        setDraft(saved);
        return;
      }
    } catch {
      /* A damaged local draft must not prevent a new conversation. */
    }
    setDraft({ sessionId: crypto.randomUUID(), text: '', skillId: null });
  }, []);
  useEffect(() => {
    if (!draft) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      setError('浏览器未能保存输入，请保留提示词后再离开。');
    }
  }, [draft]);
  const running = busy || turns.some((t) => t.status === 'running');
  async function load(sessionId: string) {
    const result = await request<{ turns: Turn[]; skills: Skill[] }>('/api/images/chat?session=' + sessionId);
    setTurns(result.turns);
    setSkills(result.skills);
  }
  useEffect(() => {
    if (!draft) return;
    let live = true;
    const poll = async () => {
      try {
        const result = await request<{ turns: Turn[]; skills: Skill[] }>('/api/images/chat?session=' + draft.sessionId);
        if (!live) return;
        setTurns(result.turns);
        setSkills(result.skills);
        if (result.turns.some((t) => t.assetIds.length)) await refresh();
      } catch (e) {
        if (live) setError(String(e));
      }
    };
    void poll();
    const timer = running ? setInterval(() => void poll(), 4000) : undefined;
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [draft?.sessionId, running, refresh]);
  async function send() {
    if (!draft || running || !draft.text.trim()) return;
    setBusy(true);
    setAnswer('');
    setError('');
    try {
      const response = await fetch('/api/images/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          sessionId: draft.sessionId,
          purposeId: 'video_cover',
          text: draft.text,
          skillId: draft.skillId,
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
          if (event.type === 'text') setAnswer(event.text);
          if (event.type === 'done') completed = true;
          if (event.type === 'error') throw Error(event.error);
        }
      }
      if (!completed) throw Error('连接已中断，请刷新查看本次结果，不要重复发送。');
      setDraft((current) => (current ? { ...current, text: '' } : current));
      await load(draft.sessionId);
      await refresh();
      setAnswer('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load(draft.sessionId).catch(() => {});
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const ids = turns.flatMap((t) => t.assetIds);
  const images = ids.map((id) => data.assets.find((a) => a.id === id)).filter((a) => a !== undefined);
  return (
    <main className="workspace images-workspace">
      <WorkspaceHeader current="/images" date={today} syncWindow={syncWindow} />
      <PageHeader
        title="生图中心"
        summary="写下提示词，发给 Codex"
        onRefresh={() => {
          if (draft) void load(draft.sessionId).catch((e) => setError(String(e)));
          void refresh();
        }}
        action={
          <Button
            disabled={!draft || running}
            disabledReason="Codex 正在处理"
            onClick={() => {
              setDraft({ sessionId: crypto.randomUUID(), text: '', skillId: draft?.skillId ?? null });
              setTurns([]);
              setAnswer('');
              setError('');
            }}
          >
            新对话
          </Button>
        }
      />
      <div className="image-purpose-bar" role="group" aria-label="图片用途">
        {config.purposes.map((p) => (
          <Button
            key={p.id}
            className={p.id === 'video_cover' ? 'active' : ''}
            aria-pressed={p.id === 'video_cover'}
            disabled={running}
            disabledReason="Codex 正在处理"
            onClick={() => onPurpose(p.id)}
          >
            {p.name}
          </Button>
        ))}
      </div>
      <div className="cover-chat-grid">
        <Card title="和 Codex 对话" className="image-chat-panel">
          <label htmlFor="cover-prompt">这一期的图片提示词</label>
          <textarea
            id="cover-prompt"
            value={draft?.text ?? ''}
            disabled={!draft || running}
            rows={10}
            placeholder="在这里填写提示词，也可以继续提修改要求"
            onChange={(e) => setDraft((d) => (d ? { ...d, text: e.target.value } : d))}
          />
          <label className="cover-skill-picker" htmlFor="cover-skill">
            调用技能
            <select
              id="cover-skill"
              value={draft?.skillId ?? ''}
              disabled={!draft || running}
              onChange={(e) => setDraft((d) => (d ? { ...d, skillId: e.target.value || null } : d))}
            >
              <option value="">不使用技能</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {draft?.skillId && (
            <p className="small cover-skill-description">
              {skills.find((s) => s.id === draft.skillId)?.description ?? '所选技能已不可用，请重新选择'}
            </p>
          )}
          <Button
            variant="primary"
            disabled={
              !draft?.text.trim() ||
              running ||
              !data.generationReady ||
              (!!draft?.skillId && !skills.some((s) => s.id === draft.skillId))
            }
            disabledReason={
              running ? 'Codex 正在处理' : !data.generationReady ? data.generationMessage : '请输入提示词并选择可用技能'
            }
            onClick={() => void send()}
          >
            {running ? 'Codex 正在处理…' : '发送给 Codex'}
          </Button>
          {error && (
            <pre className="chat-verbatim" role="alert">
              {error}
            </pre>
          )}
          <div className="image-chat-history cover-chat-history">
            {turns.map((turn) => (
              <section key={turn.id}>
                <strong>我{turn.skillName ? ` · ${turn.skillName}` : ''}</strong>
                <pre className="chat-verbatim">{turn.input}</pre>
                <strong>Codex</strong>
                <pre className="chat-verbatim">{turn.output || (turn.status === 'running' ? '正在处理…' : '')}</pre>
                {turn.error && (
                  <pre className="chat-verbatim" role="alert">
                    {turn.error}
                  </pre>
                )}
              </section>
            ))}
            {answer && !turns.some((t) => t.status === 'running') && (
              <pre className="chat-verbatim" role="status">
                {answer}
              </pre>
            )}
          </div>
        </Card>
        <Card title="生成的图片" className="cover-chat-results">
          {!images.length && (
            <div className={running ? 'cover-chat-empty image-scanning' : 'cover-chat-empty'}>
              <Empty>{running ? 'Codex 正在处理，图片返回后会显示在这里' : '生成的图片会显示在这里'}</Empty>
            </div>
          )}
          {images.map((asset) => (
            <figure key={asset.id}>
              <a href={`/api/images/assets/${asset.id}/file`} target="_blank" rel="noreferrer">
                <AssetImage src={`/api/images/assets/${asset.id}/file`} alt={asset.title} />
              </a>
              <figcaption>
                <span className="mono">
                  {asset.ratio} · {asset.width} × {asset.height}
                </span>
                <a href={`/api/images/assets/${asset.id}/file`} download>
                  下载原图 →
                </a>
              </figcaption>
            </figure>
          ))}
          {!!images.length && running && <p role="status">Codex 正在处理…</p>}
        </Card>
      </div>
    </main>
  );
}
