'use client';
import { useState } from 'react';
import { Button } from './components';
import { request } from './use-resource';
export function ReplyDraft({ id }: { id: string }) {
  const [busy, setBusy] = useState(false),
    [draft, setDraft] = useState(''),
    [error, setError] = useState('');
  return (
    <div className="reply-draft">
      <Button
        disabled={busy}
        disabledReason="正在写草稿"
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            setDraft((await request<{ draft: string }>(`/api/inbox/${id}/reply-draft`, { method: 'POST' })).draft);
          } catch (e) {
            setError(String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        写回复草稿
      </Button>
      {draft && (
        <>
          <textarea aria-label="回复草稿" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(draft);
                setError('已复制，请到平台检查后发送。');
              } catch {
                setError('复制失败，请手动选取草稿。');
              }
            }}
          >
            复制草稿
          </Button>
        </>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
