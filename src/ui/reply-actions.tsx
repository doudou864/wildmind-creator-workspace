'use client';
import { useEffect, useState } from 'react';
import { isMessageArchived, type InboxMessage } from '@/lib/inbox-model';
import { Button } from './components';
import { request } from './use-resource';
export type ReplyDestinations = Record<
  string,
  { comment?: string; dm?: string; hint?: string; commentTemplate?: string }
>;
export function ReplyActions({ message, destinations }: { message: InboxMessage; destinations: ReplyDestinations }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const destination = destinations[message.platformId];
  const direct =
    message.channel === 'comment' && message.platformPostId && destination?.commentTemplate
      ? destination.commentTemplate
          .replace('{postId}', encodeURIComponent(message.platformPostId))
          .replace('{title}', encodeURIComponent(encodeURIComponent(message.contentTitle ?? '')))
      : null;
  const href = direct ?? destination?.[message.channel];
  async function handle(action: 'replied' | 'low_value' | 'undo', go = false) {
    if (busy) return;
    // Open synchronously in the user gesture, before awaiting local persistence.
    if (go && href) {
      const opened = window.open(href, '_blank');
      if (!opened) {
        setError('浏览器拦住了新窗口，请允许打开后重试');
        return;
      }
      opened.opener = null;
    }
    setBusy(true);
    setError('');
    try {
      const result = await request<{ item: InboxMessage }>(`/api/inbox/${encodeURIComponent(message.id)}/handle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          expectedRevision: message.revision,
          expectedActionId: message.manualActionId ?? null,
        }),
      });
      let copyError = '';
      if (go)
        try {
          await navigator.clipboard.writeText(`${message.author} ${Array.from(message.body).slice(0, 20).join('')}`);
        } catch {
          copyError = '；复制失败，请手动复制名字和评论';
        }
      window.dispatchEvent(
        new CustomEvent('inbox-handled', {
          detail: {
            item: result.item,
            text:
              (action === 'replied' ? '已标记为已回复' : action === 'low_value' ? '已归档为低价值' : '已撤销手动标记') +
              copyError,
            canUndo: action !== 'undo',
          },
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败，请刷新核对');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="reply-actions">
      {isMessageArchived(message) ? (
        <Button
          disabled={busy || !message.manualDisposition}
          disabledReason={busy ? '正在保存' : '平台已确认回复，没有可撤销的手动标记'}
          onClick={() => void handle('undo')}
        >
          撤销归档
        </Button>
      ) : (
        <>
          <Button
            variant="text"
            disabled={busy || !href}
            disabledReason={!href ? '没有经过核实的平台入口' : '正在保存'}
            onClick={() => void handle('replied', true)}
          >
            去回复
          </Button>
          <Button disabled={busy} disabledReason="正在保存" onClick={() => void handle('low_value')}>
            不用回（低价值）
          </Button>
          <Button disabled={busy} disabledReason="正在保存" onClick={() => void handle('replied')}>
            标为已回复
          </Button>
        </>
      )}
      {!direct && href && (
        <small>
          {message.channel === 'comment'
            ? `在《${message.contentTitle ?? '原作品'}》下找 @${message.author}`
            : `在私信中找 @${message.author}`}
          {destination?.hint ? ` · ${destination.hint}` : ''}
        </small>
      )}
      {error && <span role="status">{error}</span>}
    </div>
  );
}
export function ReplyToast() {
  const [notice, setNotice] = useState<{ item: InboxMessage; text: string; canUndo: boolean } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const receive = (event: Event) => {
      clearTimeout(timer);
      setNotice((event as CustomEvent).detail);
      timer = setTimeout(() => setNotice(null), 10000);
    };
    window.addEventListener('inbox-handled', receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('inbox-handled', receive);
    };
  }, []);
  if (!notice) return null;
  return (
    <div className="undo-toast" role="status">
      {notice.text}
      {notice.canUndo && (
        <Button
          onClick={async () => {
            try {
              await request(`/api/inbox/${encodeURIComponent(notice.item.id)}/handle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'undo',
                  expectedRevision: notice.item.revision,
                  expectedActionId: notice.item.manualActionId,
                }),
              });
              window.dispatchEvent(
                new CustomEvent('inbox-handled', { detail: { ...notice, text: '已撤销手动标记', canUndo: false } }),
              );
            } catch (e) {
              setNotice({ ...notice, text: e instanceof Error ? e.message : '撤销失败，请刷新核对', canUndo: false });
            }
          }}
        >
          撤销
        </Button>
      )}
    </div>
  );
}
