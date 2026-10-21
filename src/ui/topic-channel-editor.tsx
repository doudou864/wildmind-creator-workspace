'use client';
import { useEffect, useState } from 'react';
import type { TopicChannel } from '@/lib/topic-channels';
import { Button, Card } from './components';
import { request } from './use-resource';
type ChannelData = { channels: TopicChannel[]; revision: string };
export function TopicChannelEditor({ onChanged }: { onChanged: (channels: TopicChannel[]) => void }) {
  const [data, setData] = useState<ChannelData | null>(null),
    [title, setTitle] = useState(''),
    [link, setLink] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string; link: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function load() {
    try {
      setData(await request<ChannelData>('/api/topics/channels'));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '读取渠道失败');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(action: 'add' | 'edit' | 'remove', id?: string) {
    if (!data || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const fields =
        action === 'remove'
          ? { id }
          : action === 'edit'
            ? { id, title: editing?.title, link: editing?.link }
            : { title, link };
      const next = await request<ChannelData>('/api/topics/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, revision: data.revision, ...fields }),
      });
      setData(next);
      onChanged(next.channels);
      if (action === 'add') {
        setTitle('');
        setLink('');
      }
      if (action === 'edit') setEditing(null);
      setNotice(action === 'remove' ? '已删除渠道，已有选题保留' : '已保存，下次生成选题时使用');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '保存失败，输入已保留');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="选题渠道" className="topic-channel-editor">
      <form
        className="topic-channel-fields"
        onSubmit={(e) => {
          e.preventDefault();
          void save('add');
        }}
      >
        <label>
          标题
          <input
            aria-label="渠道标题"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：常看的创作者或网站"
            disabled={busy}
          />
        </label>
        <label>
          链接
          <input
            aria-label="渠道链接"
            required
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…"
            disabled={busy}
          />
        </label>
        <Button
          type="submit"
          disabled={busy || !data || !title.trim() || !link.trim()}
          disabledReason={!data ? '渠道尚未读取完成' : busy ? '正在保存' : '填写标题和链接后添加'}
        >
          添加渠道
        </Button>
      </form>
      {data?.channels
        .filter((c) => c.kind === 'external')
        .map((channel) => (
          <div className="topic-channel-entry" key={channel.id}>
            {editing?.id === channel.id ? (
              <form
                className="topic-channel-fields"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save('edit', channel.id);
                }}
              >
                <label>
                  标题
                  <input
                    aria-label="修改渠道标题"
                    required
                    maxLength={200}
                    disabled={busy}
                    value={editing.title}
                    onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  />
                </label>
                <label>
                  链接
                  <input
                    aria-label="修改渠道链接"
                    required
                    type="url"
                    disabled={busy}
                    value={editing.link}
                    onChange={(e) => setEditing({ ...editing, link: e.target.value })}
                  />
                </label>
                <Button type="submit" disabled={busy} disabledReason="正在保存">
                  保存
                </Button>
                <Button type="button" disabled={busy} disabledReason="正在保存" onClick={() => setEditing(null)}>
                  取消
                </Button>
              </form>
            ) : (
              <>
                <a href={channel.location} target="_blank" rel="noreferrer">
                  <strong>{channel.name}</strong>
                  <span>{channel.location} →</span>
                </a>
                <Button
                  disabled={busy}
                  disabledReason="正在保存"
                  onClick={() => setEditing({ id: channel.id, title: channel.name, link: channel.location })}
                >
                  修改
                </Button>
                <Button disabled={busy} disabledReason="正在保存" onClick={() => void save('remove', channel.id)}>
                  删除
                </Button>
              </>
            )}
          </div>
        ))}
      {notice && (
        <p role="status">
          {notice}{' '}
          <Button variant="text" disabled={busy} disabledReason="正在保存" onClick={() => void load()}>
            重新读取渠道
          </Button>
        </p>
      )}
    </Card>
  );
}
