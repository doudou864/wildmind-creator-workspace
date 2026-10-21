'use client';
import { useEffect, useState } from 'react';
import type { TopicChannel } from '@/lib/topic-channels';
import { Button, Card } from './components';
import { request } from './use-resource';
type ChannelData = { channels: TopicChannel[]; revision: string };
type Row = { key: string; id?: string; title: string; link: string; dirty: boolean };
export function TopicChannelEditor({
  onChanged,
  onPendingChange,
}: {
  onChanged: (channels: TopicChannel[]) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [data, setData] = useState<ChannelData | null>(null),
    [rows, setRows] = useState<Row[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    onPendingChange?.(busy || rows.some((r) => r.dirty));
  }, [busy, rows, onPendingChange]);
  async function load() {
    try {
      const next = await request<ChannelData>('/api/topics/channels');
      setData(next);
      onChanged(next.channels);
      setRows((current) => [
        ...next.channels
          .filter((c) => c.kind === 'external')
          .map(
            (c) =>
              current.find((r) => r.id === c.id && r.dirty) ?? {
                key: c.id,
                id: c.id,
                title: c.name,
                link: c.location,
                dirty: false,
              },
          ),
        ...current.filter((r) => !r.id),
      ]);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '读取失败');
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function change(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch, dirty: true } : r)));
  }
  async function save(row: Row, remove = false) {
    if (!row.id && remove) {
      setRows((current) => current.filter((r) => r.key !== row.key));
      return;
    }
    if (!data || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const fields = remove
        ? { action: 'remove', id: row.id }
        : { action: row.id ? 'edit' : 'add', ...(row.id ? { id: row.id } : {}), title: row.title, link: row.link };
      const next = await request<ChannelData>('/api/topics/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: data.revision, ...fields }),
      });
      const saved = row.id
        ? next.channels.find((c) => c.id === row.id)
        : next.channels.find((c) => !data.channels.some((old) => old.id === c.id));
      if (!remove && !saved) throw Error('保存结果未确认，请重新读取渠道');
      setData(next);
      onChanged(next.channels);
      setRows((current) =>
        remove
          ? current.filter((r) => r.key !== row.key)
          : current.map((r) =>
              r.key === row.key
                ? { key: r.key, id: saved!.id, title: saved!.name, link: saved!.location, dirty: false }
                : r,
            ),
      );
      setNotice(remove ? '已删除，已有选题保留' : '已保存，下次生成选题时使用');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '保存失败，输入已保留');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card title="选题渠道" className="topic-channel-editor">
      <Button
        disabled={busy || !data}
        disabledReason={busy ? '正在保存' : '正在读取渠道'}
        onClick={() =>
          setRows((current) => [...current, { key: crypto.randomUUID(), title: '', link: '', dirty: true }])
        }
      >
        增加一行
      </Button>
      <div className="topic-channel-rows">
        {rows.map((row, index) => (
          <form
            key={row.key}
            className="topic-channel-fields"
            onSubmit={(e) => {
              e.preventDefault();
              void save(row);
            }}
          >
            <label>
              标题
              <input
                aria-label={`渠道 ${index + 1} 标题`}
                required
                maxLength={200}
                disabled={busy}
                value={row.title}
                onChange={(e) => change(row.key, { title: e.target.value })}
                placeholder="创作者或网站名称"
              />
            </label>
            <label>
              链接
              <input
                aria-label={`渠道 ${index + 1} 链接`}
                required
                type="url"
                disabled={busy}
                value={row.link}
                onChange={(e) => change(row.key, { link: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <div className="channel-row-actions">
              {row.dirty ? (
                <Button
                  type="submit"
                  disabled={busy || !row.title.trim() || !row.link.trim()}
                  disabledReason={busy ? '正在保存' : '请填完整标题和链接'}
                >
                  保存渠道
                </Button>
              ) : (
                <span className="small">已保存</span>
              )}
              <Button type="button" disabled={busy} disabledReason="正在保存" onClick={() => void save(row, true)}>
                删除行
              </Button>
            </div>
          </form>
        ))}
      </div>
      {notice && <p role="status">{notice}</p>}
      {!data && (
        <Button variant="text" onClick={() => void load()}>
          重新读取渠道
        </Button>
      )}
      {notice.includes('刷新') && (
        <Button variant="text" onClick={() => void load()}>
          重新读取渠道
        </Button>
      )}
    </Card>
  );
}
