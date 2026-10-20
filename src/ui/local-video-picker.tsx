'use client';
import { useEffect, useState } from 'react';
import { Button } from './components';
import { request } from './use-resource';
type Listing = {
  directories: string[];
  items: { path: string; name: string; bytes: number; modifiedAt: string; duration: number }[];
  errors: string[];
};
export function LocalVideoPicker({
  contentId,
  disabled,
  onSelected,
}: {
  contentId: string | null;
  disabled: boolean;
  onSelected: (id: string) => void;
}) {
  const [data, setData] = useState<Listing | null>(null),
    [file, setFile] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    try {
      setData(await request<Listing>('/api/publishing/local-videos'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取失败');
    }
  }
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
  useEffect(() => {
    void load();
  }, []);
  return (
    <details className="publish-local">
      <summary>从成片文件夹选择 →</summary>
      {!data?.directories.length ? (
        <p>先在 config/media.yaml 配置成片文件夹，再打开此列表。</p>
      ) : (
        <ul className="local-video-list">
          {data.items.map((item) => (
            <li key={item.path}>
              <Button
                disabled={disabled || busy || !contentId}
                disabledReason={!contentId ? '先选择作品' : '当前不能替换素材'}
                onClick={() => void select(item.path)}
              >
                {item.name}
              </Button>
              <small>
                {Math.round(item.duration)} 秒 · {(item.bytes / 1024 / 1024).toFixed(1)} MB ·{' '}
                {new Date(item.modifiedAt).toLocaleString('zh-CN')}
              </small>
            </li>
          ))}
        </ul>
      )}
      <label>
        成片绝对路径
        <input value={file} onChange={(e) => setFile(e.target.value)} placeholder="允许的成片文件夹内的 MP4 / MOV" />
      </label>
      <Button
        disabled={disabled || busy || !contentId || !file}
        disabledReason={!contentId ? '先选择作品' : !file ? '先填写成片路径' : '当前不能替换素材'}
        onClick={() => void select(file)}
      >
        选择这个文件
      </Button>
      <Button onClick={() => void load()}>重新读取文件夹</Button>
      <p className="small">只记住原文件位置，不复制、不删除原文件。</p>
      {data?.errors.map((e) => (
        <p key={e} role="status">
          {e}
        </p>
      ))}
      {error && <p role="status">{error}</p>}
    </details>
  );
}
