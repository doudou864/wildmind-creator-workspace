'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { Button, Card, Dialog, Empty } from './components';
import { AssetImage } from './asset-image';
import { request } from './use-resource';
import type { Asset } from '@/lib/image-model';
import {
  parsePublishTags,
  videoDraftCovers,
  type PublishDraft,
  type PublishingConfig,
  type PublishingData,
} from '@/lib/publishing-model';

export function VideoPublishInputs({
  draft,
  data,
  config,
  disabled,
  onChange,
  onRefresh,
}: {
  draft: PublishDraft;
  data: PublishingData;
  config: PublishingConfig;
  disabled: boolean;
  onChange: (patch: Partial<PublishDraft>) => void;
  onRefresh: () => Promise<void>;
}) {
  const input = draft.videoInput ?? {
    topicId: data.contents.find((c) => c.id === draft.contentId)?.topicId ?? null,
    path: '',
    covers: data.contents.find((c) => c.id === draft.contentId)?.videoCovers ?? {},
  };
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const [picker, setPicker] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tagText, setTagText] = useState(draft.commonCopy.tags.map((t) => `#${t}`).join(' '));
  const tagKey = JSON.stringify(draft.commonCopy.tags);
  useEffect(() => {
    setTagText((text) =>
      JSON.stringify(parsePublishTags(text)) === tagKey
        ? text
        : JSON.parse(tagKey)
            .map((t: string) => `#${t}`)
            .join(' '),
    );
  }, [tagKey]);
  function copy(patch: Partial<PublishDraft['commonCopy']>, topicId = input.topicId) {
    const commonCopy = { ...draft.commonCopy, ...patch };
    onChange({
      commonCopy,
      videoInput: { ...input, topicId },
      settings: draft.settings.map((s) => ({
        ...s,
        title: commonCopy.title,
        description: commonCopy.description,
        tags: commonCopy.tags,
        scheduleAt: null,
        individuallyEdited: false,
      })),
    });
  }
  function cover(ratio: string, assetId: string | null) {
    const covers = { ...input.covers };
    if (assetId) covers[ratio] = assetId;
    else delete covers[ratio];
    onChange({ videoInput: { ...input, covers } });
    setPicker(null);
  }
  async function uploadCover(event: ChangeEvent<HTMLInputElement>, ratio: string) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setNotice('');
    const url = URL.createObjectURL(file);
    try {
      if (!config.imageTypes.includes(file.type) || !file.size || file.size > config.imageMaxMB * 1024 * 1024)
        throw Error(`请选择 PNG / JPEG 图片，大小不超过 ${config.imageMaxMB} MB`);
      const img = new Image();
      img.src = url;
      await img.decode();
      const [w, h] = ratio.split(':').map(Number);
      if (Math.abs(img.naturalWidth * h - img.naturalHeight * w) > 0.01)
        throw Error(`这张图片是 ${img.naturalWidth} × ${img.naturalHeight}，请选择 ${ratio} 的封面`);
      const form = new FormData();
      form.set(
        'metadata',
        JSON.stringify({
          title: file.name.slice(0, 200),
          purposeId: 'video_cover',
          topicId: null,
          contentId: null,
          prompt: '',
          parentAssetId: null,
        }),
      );
      form.set('file', file);
      const asset = await request<Asset>('/api/images/assets', { method: 'POST', body: form });
      await onRefresh();
      cover(ratio, asset.id);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '封面保存失败');
    } finally {
      URL.revokeObjectURL(url);
      setUploading(false);
    }
  }
  const covers = videoDraftCovers({ ...draft, videoInput: input }, data, config);
  const matches = data.assets.filter((asset) => {
    if (!picker || !asset.title.toLowerCase().includes(search.toLowerCase())) return false;
    const [w, h] = picker.split(':').map(Number);
    return asset.width > 0 && asset.height > 0 && Math.abs(asset.width * h - asset.height * w) < 0.01;
  });
  return (
    <Card title="发布内容">
      <fieldset className="image-form video-publish-form" disabled={disabled || uploading}>
        <div className="video-publish-topic">
          <label>
            主题
            <input
              aria-label="主题"
              maxLength={200}
              placeholder="填写这条视频的主题"
              value={draft.commonCopy.title}
              onChange={(e) => copy({ title: e.target.value })}
            />
          </label>
          <label>
            从在做选题填入
            <select
              aria-label="从在做选题填入"
              value={input.topicId ?? ''}
              onChange={(e) => {
                const topic = data.topics?.find((t) => t.id === e.target.value);
                copy(topic ? { title: topic.title } : {}, topic?.id ?? null);
              }}
            >
              <option value="">自己填写</option>
              {(data.topics ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          标签
          <input
            aria-label="标签"
            placeholder="#人工智能 #效率工具"
            value={tagText}
            onChange={(e) => {
              setTagText(e.target.value);
              copy({ tags: parsePublishTags(e.target.value) });
            }}
            onBlur={() => setTagText(draft.commonCopy.tags.map((t) => `#${t}`).join(' '))}
          />
        </label>
        <div>
          <div className="video-publish-cover-heading">
            <span>封面</span>
            <Link href="/images" target="_blank">
              去生图 →
            </Link>
          </div>
          <div className="publish-covers">
            {covers.map(({ ratio, asset }) => (
              <div key={ratio}>
                {asset ? (
                  <AssetImage
                    src={`/api/images/assets/${encodeURIComponent(asset.id)}/file`}
                    alt={`${ratio} 封面：${asset.title}`}
                  />
                ) : (
                  <div className="publish-cover-empty">{ratio}</div>
                )}
                <span className="mono small">{ratio}</span>
                <div className="video-cover-actions">
                  <Button
                    onClick={() => {
                      setSearch('');
                      setPicker(ratio);
                      void onRefresh();
                    }}
                  >
                    选已有图片
                  </Button>
                  <Button onClick={() => fileInputs.current[ratio]?.click()}>{asset ? '替换图片' : '上传图片'}</Button>
                  <input
                    ref={(element) => {
                      fileInputs.current[ratio] = element;
                    }}
                    hidden
                    type="file"
                    accept={config.imageTypes.join(',')}
                    aria-label={`上传 ${ratio} 封面`}
                    onChange={(e) => void uploadCover(e, ratio)}
                  />
                  {input.covers[ratio] && (
                    <Button onClick={() => cover(ratio, null)} aria-label={`移除 ${ratio} 封面`}>
                      移除封面
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <label>
          视频地址
          <input
            aria-label="视频地址"
            value={input.path}
            placeholder="粘贴本机 MP4 / MOV 视频的完整路径"
            onChange={(e) => onChange({ videoInput: { ...input, path: e.target.value }, videoId: null })}
          />
        </label>
        {!input.path && draft.videoId && (
          <p className="small">
            已保留原成片：{data.videos.find((v) => v.id === draft.videoId)?.name}；填写新地址可替换。
          </p>
        )}
      </fieldset>
      {notice && (
        <p className="topic-feedback" role="alert">
          {notice}
        </p>
      )}
      {picker && (
        <Dialog title={`选择 ${picker} 封面`} onClose={() => setPicker(null)}>
          <div className="image-form">
            <input
              aria-label="搜索封面"
              placeholder="搜索已生成或上传的图片"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {matches.length ? (
            <div className="asset-picker">
              {matches.map((asset) => (
                <Button
                  key={asset.id}
                  className="asset-tile"
                  disabled={disabled}
                  onClick={() => cover(picker, asset.id)}
                >
                  <AssetImage src={`/api/images/assets/${encodeURIComponent(asset.id)}/file`} alt={asset.title} />
                  <strong>{asset.title}</strong>
                  <span className="small">
                    {asset.width} × {asset.height}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty>暂无这个比例的图片，可上传封面或到生图中心制作。</Empty>
          )}
        </Dialog>
      )}
    </Card>
  );
}
