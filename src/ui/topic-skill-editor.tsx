'use client';
import { useEffect, useState } from 'react';
import type { TopicSkill } from '@/lib/topic-skill';
import { Button, Card } from './components';
import { request } from './use-resource';

export function TopicSkillEditor({
  onState,
  refreshKey,
}: {
  onState: (state: { pending: boolean; revision: string }) => void;
  refreshKey: number;
}) {
  const [skill, setSkill] = useState<TopicSkill | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [active, setActive] = useState('SKILL.md');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const dirty = !!skill?.files.some((f) => drafts[f.id] !== f.content);
  useEffect(() => {
    onState({ pending: !skill || dirty || busy, revision: skill?.revision ?? '' });
  }, [skill, dirty, busy, onState]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  async function load() {
    setBusy(true);
    setError('');
    try {
      const next = await request<TopicSkill>('/api/topics/skill');
      setSkill(next);
      setDrafts(Object.fromEntries(next.files.map((f) => [f.id, f.content])));
      if (!next.files.some((f) => f.id === active)) setActive(next.files[0].id);
      setSaved('已读取当前 Skill');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Skill 读取失败');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!dirty) void load();
  }, [refreshKey]); // Refresh must not overwrite unsaved text.
  async function save() {
    if (!skill) return;
    setBusy(true);
    setError('');
    setSaved('');
    try {
      const next = await request<TopicSkill>('/api/topics/skill', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: active, content: drafts[active], revision: skill.revision }),
      });
      setSkill(next);
      setDrafts((current) =>
        Object.fromEntries(
          next.files.map((f) => [f.id, f.id === active || !(f.id in current) ? f.content : current[f.id]]),
        ),
      );
      setSaved('已保存，下次找题生效');
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，文字已保留');
    } finally {
      setBusy(false);
    }
  }
  const label = (id: string) =>
    id === 'SKILL.md'
      ? '选题规则'
      : id === 'references/sources.md'
        ? '来源入口'
        : id === 'references/angle-calibration.md'
          ? '角度校准'
          : id;
  return (
    <Card title="选题 Skill" className="topic-skill-editor">
      {skill && (
        <>
          <div className="topic-skill-tabs" role="tablist" aria-label="Skill 文档">
            {skill.files.map((f) => (
              <button key={f.id} role="tab" aria-selected={active === f.id} onClick={() => setActive(f.id)}>
                {label(f.id)}
                {drafts[f.id] !== f.content ? ' · 未保存' : ''}
              </button>
            ))}
          </div>
          <textarea
            aria-label={label(active)}
            spellCheck={false}
            value={drafts[active] ?? ''}
            onChange={(e) => {
              setDrafts({ ...drafts, [active]: e.target.value });
              setSaved('');
            }}
            disabled={busy}
          />
          <div className="topic-skill-actions">
            <Button
              onClick={() => void save()}
              disabled={busy || drafts[active] === skill.files.find((f) => f.id === active)?.content}
              disabledReason="当前文档没有未保存的修改"
            >
              {busy ? '正在处理…' : '保存修改'}
            </Button>
            <span role="status">{dirty ? '有未保存修改' : saved || '已保存'}</span>
          </div>
          <details className="topic-skill-location">
            <summary>原文件 · 版本 {skill.revision.slice(0, 8)}</summary>
            <p>{skill.path}</p>
          </details>
        </>
      )}
      {!skill && !error && <p>正在读取 Skill…</p>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <Button onClick={() => void load()} disabled={busy}>
            {dirty ? '放弃草稿并重新读取' : '重新读取'}
          </Button>
        </div>
      )}
    </Card>
  );
}
