'use client';
import { usePathname } from 'next/navigation';
import { useEditSession } from './use-edit-session';
import { useState } from 'react';
import { contentInputSchema, contentSchema, contentMatches, type Content, type ContentData } from '@/lib/content-model';
import { Button, Dialog } from './components';
import { request, useResource } from './use-resource';
const empty: ContentData = { items: [], topics: [], recordsReady: false, writeReady: false, message: '作品服务待接入' };
export function ContentPicker({
  value,
  onChange,
  topicId = null,
  form,
  disabled = false,
  sessionId = 'main',
}: {
  sessionId?: string;
  value: string | null;
  onChange: (id: string | null, content?: Content) => void;
  topicId?: string | null;
  form?: Content['form'];
  disabled?: boolean;
}) {
  const { data, error, refresh } = useResource<ContentData>('/api/contents', empty, true);
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState(''),
    [topic, setTopic] = useState(topicId ?? ''),
    [kind, setKind] = useState<Content['form']>(form ?? '视频'),
    [date, setDate] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const pathname = usePathname();
  useEditSession(
    `new-content:${pathname}:${sessionId}:${topicId ?? 'none'}`,
    { title, topic, kind, date },
    open && !!(title || date),
    (saved) => {
      setTitle(saved.title);
      setTopic(saved.topic);
      setKind(saved.kind);
      setDate(saved.date);
      setOpen(true);
      setNotice('已恢复未保存的新作品信息。');
    },
  );
  const [created, setCreated] = useState<Content[]>([]);
  const items = [...data.items, ...created.filter((c) => !data.items.some((i) => i.id === c.id))];
  const available = items.filter((c) => contentMatches(c, topicId, form));
  async function create() {
    if (!data.writeReady || busy) return;
    const input = contentInputSchema.safeParse({
      title,
      topicId: topic || null,
      form: kind,
      plannedDate: date || null,
    });
    if (!input.success) {
      setNotice('请检查标题和计划日期。');
      return;
    }
    setBusy(true);
    try {
      const result = contentSchema.parse(
        await request('/api/contents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input.data),
        }),
      );
      if (Object.entries(input.data).some(([key, v]) => result[key as keyof Content] !== v))
        throw new Error('作品保存结果与提交内容不一致，请刷新核对。');
      setCreated((list) => [...list, result]);
      onChange(result.id, result);
      setOpen(false);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="image-form">
      <label>
        关联作品
        <select
          aria-label="关联作品"
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) =>
            onChange(
              e.target.value || null,
              items.find((c) => c.id === e.target.value),
            )
          }
        >
          <option value="">请选择作品</option>
          {value && !available.some((c) => c.id === value) && (
            <option value={value}>当前作品不符合范围或暂不可用</option>
          )}
          {available.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} · {c.form}
            </option>
          ))}
        </select>
      </label>
      <div>
        <Button
          disabled={disabled || !data.writeReady}
          title={!data.writeReady ? '作品保存服务待接入' : undefined}
          onClick={() => {
            setTitle('');
            setTopic(topicId ?? '');
            setKind(form ?? '视频');
            setDate('');
            setNotice('');
            setOpen(true);
          }}
        >
          新建作品
        </Button>{' '}
        <Button disabled={busy} onClick={() => void refresh()}>
          刷新作品
        </Button>
      </div>
      {!data.recordsReady && <p className="small">作品服务待接入；新建和保存暂不可用。</p>}
      {error && <p role="alert">{error}</p>}
      {open && (
        <Dialog
          title="新建作品"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <fieldset className="image-form" disabled={busy}>
            <label>
              作品标题
              <input aria-label="新作品标题" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label>
              选题
              <select
                aria-label="新作品选题"
                disabled={!!topicId}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              >
                <option value="">不关联选题</option>
                {data.topics.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              内容形式
              <select
                aria-label="新作品形式"
                disabled={!!form}
                value={kind}
                onChange={(e) => setKind(e.target.value as Content['form'])}
              >
                <option>视频</option>
                <option>图文</option>
              </select>
            </label>
            <label>
              计划发布日期（可选）
              <input aria-label="计划发布日期" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </fieldset>
          <p className="small">同一个选题可以分别制作视频或图文，每条作品独立关联素材和发布记录。</p>
          {notice && <p role="alert">{notice}</p>}
          <Button
            disabled={
              busy || !title.trim() || !data.writeReady || (!!topic && !data.topics.some((t) => t.id === topic))
            }
            onClick={() => void create()}
          >
            创建并关联
          </Button>
        </Dialog>
      )}
    </div>
  );
}
