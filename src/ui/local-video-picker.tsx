'use client';
import { useState } from 'react';
import { Button } from './components';
import { request } from './use-resource';
export function LocalVideoPicker({
  contentId,
  disabled,
  onSelected,
}: {
  contentId: string | null;
  disabled: boolean;
  onSelected: (id: string) => void;
}) {
  const [file, setFile] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function select(path: string) {
    if (!contentId || disabled || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ video: { id: string } }>('/api/publishing/local-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, path }),
      });
      onSelected(result.video.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : '选择失败');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="publish-local">
      <label>
        视频文件路径
        <input value={file} onChange={(e) => setFile(e.target.value)} placeholder="粘贴具体 MP4 / MOV 文件的绝对路径" />
      </label>
      <Button
        disabled={disabled || busy || !contentId || !file}
        disabledReason={!contentId ? '先选择作品' : !file ? '先填写成片路径' : '当前不能替换素材'}
        onClick={() => void select(file)}
      >
        读取这个视频
      </Button>
      {error && <p role="status">{error}</p>}
    </div>
  );
}
