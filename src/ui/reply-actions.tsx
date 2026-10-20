'use client';
import { useState } from 'react';
import type { InboxMessage } from '@/lib/inbox-model';
import { Button } from './components';
export type ReplyDestinations = Record<string, { comment?: string; dm?: string; hint?: string }>;
export function ReplyActions({ message, destinations }: { message: InboxMessage; destinations: ReplyDestinations }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const direct = message.sourceUrl && /^https?:\/\//.test(message.sourceUrl) ? message.sourceUrl : null;
  const destination = destinations[message.platformId];
  const href = direct ?? destination?.[message.channel];
  return (
    <div className="reply-actions">
      {href ? (
        <a className="button button-text" href={href} target="_blank" rel="noreferrer">
          去平台回复 ↗
        </a>
      ) : (
        <Button disabled disabledReason="这个平台暂没有可核实的回复入口。">
          去平台回复
        </Button>
      )}
      <Button
        disabled={!message.author}
        disabledReason="没有读到发送者名字。"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(message.author);
            setCopied(true);
            setError('');
          } catch {
            setError('复制失败，请选中名字手动复制');
          }
        }}
      >
        {copied ? '已复制名字' : '复制名字'}
      </Button>
      {!direct && destination?.hint && <small>{destination.hint}</small>}
      {error && <span role="status">{error}</span>}
    </div>
  );
}
