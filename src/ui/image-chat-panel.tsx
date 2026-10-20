'use client';
import { useEffect, useState } from 'react';
import { Button, Card } from './components';
import { request } from './use-resource';
type Turn = { id: string; input: string; output: string; error: string | null; status: string; referenceIds: string[] };
export function ImageChatPanel({
  contentId,
  purposeId,
  referenceIds,
  onDone,
}: {
  contentId: string | null;
  purposeId: string;
  referenceIds: string[];
  onDone: () => void;
}) {
  const [history, setHistory] = useState<{ instructions: string; turns: Turn[] }>({ instructions: '', turns: [] }),
    [text, setText] = useState(''),
    [answer, setAnswer] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    if (contentId) setHistory(await request('/api/images/chat?content=' + encodeURIComponent(contentId)));
  }
  useEffect(() => {
    setHistory({ instructions: '', turns: [] });
    setAnswer('');
    setError('');
    void load().catch((e) => setError(String(e)));
  }, [contentId]);
  async function send() {
    if (!contentId || busy || !text.trim()) return;
    setBusy(true);
    setAnswer('');
    setError('');
    try {
      const response = await fetch('/api/images/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: crypto.randomUUID(), contentId, purposeId, text, referenceIds }),
      });
      if (!response.ok || !response.body) throw Error(await response.text());
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const event = JSON.parse(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
          if (event.type === 'done') completed = true;
          if (event.type === 'text') setAnswer(event.text);
          if (event.type === 'error') throw Error(event.error);
        }
      }
      if (!completed) throw Error('连接已中断；请刷新查看本次对话结果，不要重复发送。');
      setText('');
      await load();
      setAnswer('');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="和 Codex 对话" className="image-chat-panel">
      <details>
        <summary>查看附加说明原文</summary>
        <pre className="chat-verbatim">{history.instructions || '选择作品后读取说明'}</pre>
      </details>
      <div className="image-chat-history">
        {history.turns.map((turn) => (
          <section key={turn.id}>
            <strong>我{turn.referenceIds.length ? ` · ${turn.referenceIds.length} 张参考图` : ''}</strong>
            <pre className="chat-verbatim">{turn.input}</pre>
            <strong>Codex</strong>
            <pre className="chat-verbatim">{turn.output}</pre>
            {turn.error && (
              <pre role="alert" className="chat-verbatim">
                {turn.error}
              </pre>
            )}
            {turn.status === 'running' && <p>对话正在处理，可稍后刷新查看。</p>}
          </section>
        ))}
        {answer && (
          <pre className="chat-verbatim" role="status">
            {answer}
          </pre>
        )}
      </div>
      <textarea
        aria-label="给 Codex 的消息"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        rows={4}
        placeholder="直接说你的要求，文字会原样发送"
      />
      <p className="small">带上方已选的 {referenceIds.length} 张参考图。</p>
      <Button
        disabled={!contentId || busy || !text.trim()}
        disabledReason={!contentId ? '请先选择作品' : busy ? 'Codex 正在回答' : '请输入消息'}
        onClick={() => void send()}
      >
        {busy ? '等待回答…' : '发送给 Codex'}
      </Button>
      {error && (
        <pre className="chat-verbatim" role="alert">
          {error}
        </pre>
      )}
    </Card>
  );
}
