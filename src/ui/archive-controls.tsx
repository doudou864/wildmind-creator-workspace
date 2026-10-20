'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog } from './components';
import { request } from './use-resource';
import type { ArchiveKind } from '@/lib/record-archives';
const names = { content: '作品', layout: '排版草稿', image_draft: '生图草稿', asset: '素材', topic: '选题' };
async function change(kind: ArchiveKind, id: string, archived: boolean) {
  await request('/api/archives', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, id, archived }),
  });
  window.dispatchEvent(new Event('workspace-archive'));
  if (archived) window.dispatchEvent(new CustomEvent('archived-record', { detail: { kind, id } }));
}
export function ArchiveButton({
  kind,
  id,
  afterArchive,
  onArchived,
}: {
  kind: ArchiveKind;
  id: string;
  afterArchive?: string;
  onArchived?: () => void;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <span>
      <Button
        disabled={busy}
        disabledReason="正在归档"
        onClick={async () => {
          setBusy(true);
          try {
            await change(kind, id, true);
            onArchived?.();
            if (afterArchive) router.replace(afterArchive);
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        归档{names[kind]}
      </Button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
type Row = { kind: ArchiveKind; recordId: string; title: string; archivedAt: string; fixture?: boolean };
export function ArchiveCenter() {
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(''),
    [last, setLast] = useState<{ kind: ArchiveKind; id: string } | null>(null);
  async function load() {
    try {
      setRows((await request<{ items: Row[] }>('/api/archives')).items.filter((row) => !row.fixture));
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    const event = (e: Event) => setLast((e as CustomEvent).detail);
    window.addEventListener('archived-record', event);
    return () => window.removeEventListener('archived-record', event);
  }, []);
  useEffect(() => {
    if (!last) return;
    const timer = setTimeout(() => setLast(null), 10000);
    return () => clearTimeout(timer);
  }, [last]);
  async function undo(kind: ArchiveKind, id: string) {
    try {
      await change(kind, id, false);
      setLast(null);
      await load();
      router.refresh();
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <>
      <Button
        variant="text"
        onClick={() => {
          setOpen(true);
          void load();
        }}
      >
        已归档
      </Button>
      {last && (
        <div className="undo-toast" role="status">
          已归档{names[last.kind]}
          <Button onClick={() => void undo(last.kind, last.id)}>撤销</Button>
        </div>
      )}
      {open && (
        <Dialog title="已归档" onClose={() => setOpen(false)}>
          {rows.length ? (
            rows.map((row) => (
              <div className="archive-row" key={row.kind + row.recordId}>
                <span>
                  {names[row.kind]} · {row.title}
                </span>
                <Button onClick={() => void undo(row.kind, row.recordId)}>撤销归档</Button>
              </div>
            ))
          ) : (
            <p>没有已归档的记录。</p>
          )}
          <p className="small">归档只收起默认列表，不删除记录，不改变历史基线。</p>
          {error && <p role="alert">{error}</p>}
        </Dialog>
      )}
    </>
  );
}
