'use client';
import { useState } from 'react';
import type { Asset, ImageDraftInput } from '@/lib/image-model';
import { request } from './use-resource';
import { Button } from './components';
export function ImageReferencePicker({
  draft,
  assets,
  onChange,
  onUploaded,
  disabled = false,
}: {
  draft: ImageDraftInput;
  assets: Asset[];
  onChange: (ids: string[]) => void;
  onUploaded: () => void;
  disabled?: boolean;
}) {
  const ids = draft.referenceIds ?? [],
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.set('file', file);
      body.set(
        'metadata',
        JSON.stringify({
          title: file.name.slice(0, 200),
          purposeId: draft.purposeId,
          topicId: draft.topicId,
          contentId: draft.contentId,
          prompt: '',
          parentAssetId: null,
        }),
      );
      const asset = await request<Asset>('/api/images/assets', { method: 'POST', body });
      onChange([...ids, asset.id]);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="image-references">
      <label>
        参考图（最多 3 张）
        <select
          aria-label="添加参考图"
          disabled={disabled || busy || ids.length >= 3}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...ids, e.target.value]);
          }}
        >
          <option value="">从素材库选择</option>
          {assets
            .filter((a) => !ids.includes(a.id))
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
        </select>
      </label>
      <input
        aria-label="上传参考图"
        type="file"
        accept="image/png,image/jpeg"
        disabled={disabled || busy || ids.length >= 3}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = '';
        }}
      />
      {ids.map((id) => (
        <div key={id}>
          <span>{assets.find((a) => a.id === id)?.title ?? '已选参考图'}</span>
          <Button disabled={disabled || busy} onClick={() => onChange(ids.filter((x) => x !== id))}>
            移除参考
          </Button>
        </div>
      ))}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
