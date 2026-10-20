'use client';
import Link from 'next/link';
import { ArchiveButton } from '@/ui/archive-controls';
import { ImageReferencePicker } from '@/ui/image-reference-picker';
import { ImageChatPanel } from '@/ui/image-chat-panel';
import { ManualCropDialog } from '@/ui/manual-crop-dialog';
import { inboxTime } from '@/lib/inbox-model';
import { ContentPicker } from '@/ui/content-picker';
import { AutosaveStatus } from '@/ui/autosave-status';
import type { SaveContext } from '@/ui/autosave-queue';
import { useAutosave } from '@/ui/use-autosave';
import { useEditSession } from '@/ui/use-edit-session';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  assetMetadataSchema,
  imageSlots,
  canReuseAsset,
  imageDraftSchema,
  type Asset,
  type ImageConfig,
  type ImageData,
  type ImageDraft,
  type ImageDraftInput,
} from '@/lib/image-model';
import { PageHeader, Tag, Button, Card, Dialog, Empty, Segmented } from '@/ui/components';
import { AssetImage } from '@/ui/asset-image';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { request, useResource } from '@/ui/use-resource';

type Preview = { file: File; url: string; width: number; height: number };
export default function ImagesPage({
  config,
  initialData,
  today,
  syncWindow,
  initialTopic,
  initialContent = null,
}: {
  config: ImageConfig;
  initialData: ImageData;
  today: string;
  syncWindow: string;
  initialTopic: string | null;
  initialContent?: string | null;
}) {
  const { data, error, refresh } = useResource('/api/images', initialData);
  const blank = (): ImageDraftInput => ({
    uploadPurposeId: config.purposes.find((p) => p.contentMode === 'free')!.id,
    title:
      `${data.contents.find((c) => c.id === initialContent)?.title ?? data.topics.find((t) => t.id === initialTopic)?.title ?? '新图片'} · ${today}`.slice(
        0,
        200,
      ),
    purposeId: config.purposes[0].id,
    styleId: config.styles[0].id,
    prompt: '',
    content: '',
    ratio: config.purposes[0].ratios[0] ?? '',
    topicId:
      data.contents.find((c) => c.id === initialContent)?.topicId ??
      (data.topics.some((t) => t.id === initialTopic) ? initialTopic : null),
    contentId: initialContent,
    existingAssets: {},
    parentAssetId: null,
    editInstruction: '',
  });
  const [draft, setDraft] = useState<ImageDraftInput>(blank);
  const [cropId, setCropId] = useState<string | null>(null);
  const seenCrops = useRef(new Set<string>());
  const pendingCrops = (data.pendingCrops ?? []).filter((c) => c.contentId === draft.contentId);
  useEffect(() => {
    const next = pendingCrops.find((c) => !seenCrops.current.has(c.id));
    if (next) {
      seenCrops.current.add(next.id);
      setCropId(next.id);
    }
  }, [data.pendingCrops, draft.contentId]);
  const [draftMeta, setDraftMeta] = useState<{ id: string } | null>(null);
  const savedRecord = useRef<string | null>(null);
  const editSession = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [requestBusy, setBusy] = useState(false);
  const activeTask = data.tasks?.find((t) => t.status === 'queued' || t.status === 'running');
  const busy = requestBusy || !!activeTask;
  const restoredTask = useRef<string | null>(null);
  useEffect(() => {
    if (activeTask && restoredTask.current !== activeTask.id) {
      restoredTask.current = activeTask.id;
      setDraft(activeTask.input);
      setDraftMeta(null);
      savedRecord.current = null;
      editSession.current++;
      setDirty(false);
      setNotice('图片在后台生成中，刷新或关闭页面不会取消，也不会重复计次。');
    } else if (!activeTask && restoredTask.current) {
      const finished = data.tasks?.find((t) => t.id === restoredTask.current);
      if (finished?.status === 'success' || finished?.status === 'failed') {
        setNotice(
          finished.status === 'success'
            ? '后台生成完成，请查看素材或待裁剪图片。'
            : (finished.reason ?? '后台生成失败。'),
        );
        if (finished.status === 'success') {
          setTab('library');
          setAssetId(finished.assetIds[0] ?? '');
        }
        restoredTask.current = null;
      }
    }
  }, [activeTask, data.tasks]);
  useEffect(() => {
    if (!activeTask) return;
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [activeTask?.id, refresh]);
  const [notice, setNotice] = useState(
    initialTopic && !data.topics.some((t) => t.id === initialTopic) ? '关联选题暂不可用，未自动关联。' : '',
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewUrl = useRef<string | null>(null);
  const fileRequest = useRef(0);
  const [assetId, setAssetId] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [allWorks, setAllWorks] = useState(false);
  const [search, setSearch] = useState('');
  const [pickSlot, setPickSlot] = useState<string | null>(null);
  const [tab, setTab] = useState<'outputs' | 'library'>('outputs');
  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadRevision, setUploadRevision] = useState(false);
  const [metadata, setMetadata] = useState<{
    asset: Asset;
    title: string;
    purposeId: string;
    topicId: string | null;
    contentId: string | null;
  } | null>(null);
  const editRevision = useRef(0);
  const sessionDirty = useEditSession(
    `images:${initialContent ?? initialTopic ?? 'new'}`,
    { draft, draftMeta, preview, tab, uploadRevision, metadata },
    dirty || !!metadata,
    (saved) => {
      if (activeTask) return;
      setDraft(saved.draft);
      setDraftMeta(saved.draftMeta);
      setPreview(saved.preview);
      previewUrl.current = saved.preview?.url ?? null;
      setTab(saved.tab);
      setUploadRevision(saved.uploadRevision);
      setMetadata(saved.metadata);
      setDirty(true);
      setNotice('已恢复本窗口未保存的生图编辑。');
    },
  );
  const purpose = config.purposes.find((p) => p.id === draft.purposeId)!;
  const slots = imageSlots(draft, config);
  const focusedAsset = data.assets.find((a) => a.id === assetId);
  const parentAsset = data.assets.find((a) => a.id === draft.parentAssetId);
  const assets = data.assets.filter(
    (a) =>
      (allWorks || !draft.contentId || a.contentId === draft.contentId) &&
      (purposeFilter === 'all' || a.purposeId === purposeFilter) &&
      (sourceFilter === 'all' || a.source === sourceFilter) &&
      (!selectedOnly || a.selected) &&
      `${a.title} ${a.prompt}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  const versions = focusedAsset
    ? data.assets.filter((a) => a.familyId === focusedAsset.familyId).sort((a, b) => b.version - a.version)
    : [];
  const reused = slots.filter((slot) =>
    data.assets.some((a) => a.id === draft.existingAssets[slot.key] && canReuseAsset(a, slot)),
  );
  const pickingSlot = slots.find((slot) => slot.key === pickSlot);
  const pickableAssets = pickingSlot ? data.assets.filter((asset) => canReuseAsset(asset, pickingSlot)) : [];
  const isUpload = purpose.contentMode === 'upload' && (!draft.parentAssetId || uploadRevision);
  const uploadPurpose = config.purposes.find(
    (p) => p.id === (parentAsset?.purposeId ?? draft.uploadPurposeId) && p.contentMode !== 'upload',
  );
  const uploadIssue =
    preview &&
    uploadPurpose &&
    !uploadPurpose.reuseAnyRatio &&
    uploadPurpose.ratios.length &&
    !uploadPurpose.ratios.some((r) =>
      canReuseAsset({ ...preview, id: 'preview' } as unknown as Asset, { key: r, label: r, ratio: r, text: '' }),
    )
      ? '图片实际尺寸不符合所选用途的比例，请修改图片或选择其他用途。'
      : null;
  const linkedContent = data.contents.find((c) => c.id === draft.contentId);
  const associationIssue = draft.contentId
    ? !linkedContent
      ? '关联作品暂不可用，请刷新资料'
      : linkedContent.topicId !== draft.topicId
        ? '作品与选题关联不一致，请重新选择作品'
        : null
    : null;
  const hasRequirements = draft.parentAssetId
    ? draft.editInstruction.trim().length > 0
    : purpose.contentMode === 'paragraphs'
      ? draft.content.trim().length > 0
      : draft.prompt.trim().length > 0;
  const canGenerate =
    !associationIssue &&
    data.generationReady &&
    data.storageReady &&
    !!draft.title.trim() &&
    hasRequirements &&
    slots.length > reused.length &&
    !isUpload &&
    !busy;
  const assetUrl = (asset: Asset) => `/api/images/assets/${encodeURIComponent(asset.id)}/file`;
  const purposeName = (id: string) => config.purposes.find((p) => p.id === id)?.name ?? id;
  function update(patch: Partial<ImageDraftInput>) {
    editRevision.current++;
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }
  function loadDraft(value: ImageDraft | 'new') {
    if (
      value !== 'new' &&
      (!config.purposes.some((p) => p.id === value.purposeId) || !config.styles.some((s) => s.id === value.styleId))
    ) {
      setNotice('该草稿的用途或风格已从配置移除，请先恢复配置。');
      return;
    }
    editRevision.current++;
    editSession.current++;
    savedRecord.current = value === 'new' ? null : value.id;
    setUploadRevision(false);
    if (value === 'new') {
      setDraft(blank());
      savedRecord.current = null;
      setDraftMeta(null);
    } else {
      const { id, updatedAt, fixture, ...input } = value;
      setDraft(imageDraftSchema.parse(input));
      setDraftMeta({ id: value.id });
    }
    fileRequest.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(null);
    setDirty(false);
    setNotice('');
    setTab('outputs');
  }
  function requestLoad(value: ImageDraft | 'new') {
    loadDraft(value);
  }
  useEffect(
    () => () => {
      fileRequest.current++;
      if (!sessionDirty.current && previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [sessionDirty],
  );
  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const sequence = ++fileRequest.current;
    if (
      !config.acceptedTypes.includes(file.type as 'image/png' | 'image/jpeg') ||
      file.size > config.uploadMaxMB * 1024 * 1024
    ) {
      setNotice(`请选择 PNG 或 JPEG，文件不超过 ${config.uploadMaxMB} MB。`);
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (sequence !== fileRequest.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = url;
      editRevision.current++;
      setPreview({ file, url, width: image.naturalWidth, height: image.naturalHeight });
      setDirty(true);
      setNotice(data.storageReady ? '图片已读取，确认后上传入库。' : '图片仅在本页预览，存储服务待接入，尚未上传。');
    } catch {
      URL.revokeObjectURL(url);
      setNotice('图片无法读取，请选择有效的 PNG 或 JPEG。');
    }
  }
  async function saveDraft({ isCurrent }: SaveContext) {
    if (!data.storageReady || associationIssue) return;
    const result = imageDraftSchema.safeParse(draft);
    if (!result.success) {
      setNotice('图片草稿格式有误，请刷新后重试。');
      return;
    }
    const submittedSession = editSession.current;
    const recordId = draftMeta?.id ?? savedRecord.current;
    try {
      const saved = await request<ImageDraft>(
        recordId ? `/api/images/drafts/${encodeURIComponent(recordId)}` : '/api/images/drafts',
        {
          method: recordId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(result.data),
        },
      );
      if (submittedSession !== editSession.current) return;
      savedRecord.current = saved.id;
      setDraftMeta({ id: saved.id });
      const unchanged = isCurrent();
      setDirty(!unchanged);
      await refresh();
    } catch (e) {
      throw e;
    }
  }
  const autosave = useAutosave(
    JSON.stringify([editSession.current, draft]),
    dirty && data.storageReady && !busy && !associationIssue && !!draft.title.trim(),
    saveDraft,
  );
  async function generate() {
    if (!canGenerate) return;
    setBusy(true);
    try {
      const payload = JSON.stringify(draft);
      const stored = localStorage.getItem('wildmind-image-request');
      const previous = stored ? (JSON.parse(stored) as { id: string; payload: string }) : null;
      const id = previous?.payload === payload ? previous.id : crypto.randomUUID();
      localStorage.setItem('wildmind-image-request', JSON.stringify({ id, payload }));
      const result = await request<{ message: string }>('/api/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': id },
        body: payload,
      });
      localStorage.removeItem('wildmind-image-request');
      setNotice(result.message);
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '生成失败，当前要求保留。');
    } finally {
      setBusy(false);
    }
  }
  async function upload() {
    if (!preview || !uploadPurpose || uploadIssue || !data.storageReady || busy) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.set('file', preview.file);
      body.set(
        'metadata',
        JSON.stringify({
          title: draft.title.trim() || preview.file.name,
          purposeId: uploadPurpose.id,
          topicId: draft.topicId,
          contentId: draft.contentId,
          prompt: draft.prompt,
          parentAssetId: draft.parentAssetId,
        }),
      );
      await request('/api/images/assets', { method: 'POST', body });
      setNotice('素材已上传入库。');
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = null;
      setPreview(null);
      await refresh();
      setTab('library');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '上传失败，文件仍保留在预览中。');
    } finally {
      setBusy(false);
    }
  }
  async function selectVersion(asset: Asset) {
    if (!data.storageReady || busy) return;
    setBusy(true);
    try {
      const result = await request<{ asset: Asset; content: import('@/lib/content-model').Content | null }>(
        `/api/images/assets/${encodeURIComponent(asset.id)}/select`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (
        result.asset.id !== asset.id ||
        !result.asset.selected ||
        (asset.contentId && result.content?.id !== asset.contentId) ||
        (asset.contentId &&
          asset.purposeId === 'video_cover' &&
          !Object.values(result.content?.videoCovers ?? {}).includes(asset.id))
      )
        throw new Error('选定与作品采用结果未确认，请刷新核对。');
      setNotice(asset.contentId ? '已选定，关联作品已采用这一张。' : '已设为素材库默认版本。');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '选版失败');
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  function prepareEdit(asset: Asset) {
    setUploadRevision(false);
    update({
      parentAssetId: asset.id,
      purposeId: asset.purposeId,
      ratio: asset.ratio,
      topicId: asset.topicId,
      contentId: asset.contentId,
      title: asset.title,
      prompt: asset.prompt,
      editInstruction: '',
    });
    setTab('outputs');
    setNotice('已设为修改原图，填写修改要求后生成新版本；原图保留。');
  }
  async function saveMetadata() {
    if (!metadata || !data.storageReady) return;
    const { asset, ...fields } = metadata;
    const input = assetMetadataSchema.safeParse(fields);
    if (!input.success) {
      setNotice('请填写素材名称并选择用途。');
      return;
    }
    try {
      const result = await request<Asset>(`/api/images/assets/${encodeURIComponent(asset.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(input.data),
      });
      if (result.id !== asset.id || Object.entries(fields).some(([k, v]) => result[k as keyof Asset] !== v))
        throw new Error('素材信息保存结果未确认，请刷新核对。');
      setMetadata((current) => (current?.asset.id === result.id ? { ...current, asset: result } : current));
      await refresh();
    } catch (e) {
      throw e;
    }
  }
  const metadataAutosave = useAutosave(
    JSON.stringify(metadata),
    !!metadata &&
      data.storageReady &&
      !busy &&
      !!metadata.title.trim() &&
      metadata.purposeId !== 'upload' &&
      Object.entries(metadata).some(([k, v]) => k !== 'asset' && metadata.asset[k as keyof Asset] !== v),
    saveMetadata,
  );
  return (
    <main className="workspace images-workspace">
      <AutosaveStatus statuses={[autosave, metadataAutosave]} />
      <WorkspaceHeader current="/images" date={today} syncWindow={syncWindow} />
      <PageHeader
        title="生图中心"
        summary={draft.contentId ? '填写画面要求，生成这条作品的配图' : '选择作品，填写画面要求'}
        onRefresh={() => void refresh()}
        action={
          <Button disabled={busy} disabledReason="正在处理图片，请稍候。" onClick={() => requestLoad('new')}>
            清空要求，另做一张
          </Button>
        }
      />
      <div className="image-purpose-bar" role="group" aria-label="图片用途">
        {config.purposes.map((item, index) => (
          <Button
            key={item.id}
            disabled={busy}
            disabledReason="正在处理，请稍候。"
            className={draft.purposeId === item.id ? 'active' : ''}
            aria-pressed={draft.purposeId === item.id}
            onClick={() => {
              setUploadRevision(false);
              update({
                purposeId: item.id,
                ratio: item.ratios[0] ?? '',
                existingAssets: {},
                parentAssetId: null,
                editInstruction: '',
              });
            }}
          >
            <strong>{item.name}</strong>
            <span className="small">{item.ratios.join(' · ') || 'PNG / JPEG'}</span>
          </Button>
        ))}
      </div>
      <div className="topic-feedback" role="status" aria-live="polite">
        {error || associationIssue || notice}
      </div>
      <section className="card creation-association">
        {' '}
        <div className="image-form-pair">
          <label htmlFor="image-topic">
            关联选题
            <select
              id="image-topic"
              disabled={!!draft.contentId || !!draft.parentAssetId || busy}
              value={draft.topicId ?? ''}
              onChange={(e) => update({ topicId: e.target.value || null })}
            >
              <option value="">不关联</option>
              {data.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <ContentPicker
            value={draft.contentId}
            topicId={draft.topicId}
            disabled={busy || !!draft.parentAssetId}
            onChange={(id, content) => {
              update({ contentId: id, topicId: content?.topicId ?? draft.topicId });
              void refresh();
            }}
          />
        </div>
        {draft.contentId && (
          <div className="creation-next">
            {linkedContent?.form !== '视频' && (
              <Link
                href={`/layouts?content=${encodeURIComponent(draft.contentId)}${draft.topicId ? `&topic=${encodeURIComponent(draft.topicId)}` : ''}`}
              >
                去排版 →
              </Link>
            )}
            <Link
              href={`/publishing?content=${encodeURIComponent(draft.contentId)}&kind=${linkedContent?.form === '视频' ? 'video' : 'layout'}`}
            >
              准备发布 →
            </Link>
          </div>
        )}
      </section>
      <div className="image-studio-grid">
        <aside className="image-brief-column">
          <Card title="内容与要求">
            <div className="image-form">
              {purpose.contentMode === 'paragraphs' && (
                <label htmlFor="image-content-text">
                  {purpose.id === 'douyin_images' ? '公众号同稿正文' : '文章正文'}
                  <textarea
                    id="image-content-text"
                    value={draft.content}
                    placeholder="粘贴文章，用空行分隔段落"
                    onChange={(e) => update({ content: e.target.value, existingAssets: {} })}
                    rows={8}
                  />
                </label>
              )}
              <label htmlFor="image-prompt">
                {isUpload ? '素材说明' : '画面要求'}
                <textarea
                  id="image-prompt"
                  value={draft.prompt}
                  placeholder={isUpload ? '记录素材内容与使用说明' : '写清主题、必须出现的文字、主体与构图要求'}
                  onChange={(e) => update({ prompt: e.target.value })}
                  rows={5}
                />
              </label>

              {!isUpload && (
                <>
                  <details>
                    <summary>风格（可选）</summary>
                    <label htmlFor="image-style">
                      生图风格
                      <select
                        id="image-style"
                        value={draft.styleId}
                        onChange={(e) => update({ styleId: e.target.value })}
                      >
                        {config.styles.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </details>
                  <ImageReferencePicker
                    draft={draft}
                    assets={data.assets}
                    disabled={busy}
                    onChange={(referenceIds) => update({ referenceIds })}
                    onUploaded={() => void refresh()}
                  />
                  {purpose.contentMode === 'free' && (
                    <label htmlFor="image-ratio">
                      图片比例
                      <select id="image-ratio" value={draft.ratio} onChange={(e) => update({ ratio: e.target.value })}>
                        {purpose.ratios.map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </>
              )}
              <div className="image-submit">
                <Button
                  variant="primary"
                  disabled={!canGenerate}
                  disabledReason={
                    !data.generationReady
                      ? '生图服务暂不可用。'
                      : !data.storageReady
                        ? '素材保存暂不可用。'
                        : busy
                          ? '正在生成，请稍候。'
                          : associationIssue || '请填写内容与要求，选择输出比例；已有图片可直接复用。'
                  }
                  onClick={() => void generate()}
                >
                  生成{slots.length ? ` ${slots.length - reused.length} 张图片` : '图片'}
                </Button>
              </div>
            </div>
          </Card>
          <ImageChatPanel
            key={draft.contentId ?? 'none'}
            contentId={draft.contentId}
            purposeId={draft.purposeId}
            referenceIds={draft.referenceIds ?? []}
            onDone={() => {
              setTab('library');
              setPurposeFilter('all');
              void refresh();
            }}
          />
        </aside>
        <section className="image-main-column">
          {pendingCrops.length > 0 && (
            <Card title="等你裁剪">
              <p>原图已保留，选择画面后存入素材库。</p>
              {pendingCrops.map((c) => (
                <Button key={c.id} onClick={() => setCropId(c.id)}>
                  {c.metadata.title} · 裁剪 {c.ratio}
                </Button>
              ))}
            </Card>
          )}
          <Card
            title={tab === 'outputs' ? '图片工作区' : '素材库'}
            meta={
              <Segmented
                label="生图工作区"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'outputs', label: '输出安排' },
                  { value: 'library', label: `素材库 ${assets.length}` },
                ]}
              />
            }
            className="image-workarea"
          >
            {tab === 'outputs' ? (
              <>
                <div className="image-workarea-summary">
                  <div>
                    <span className="eyebrow">{purpose.name}</span>
                    <h2>{draft.title || '从左侧填写图片需求'}</h2>
                  </div>
                  <span className="small">
                    {isUpload
                      ? parentAsset
                        ? `为 ${parentAsset.title} 上传新版本，保留原版本`
                        : '上传原图，保留实际尺寸'
                      : `${slots.length} 个输出 · 已有图 ${reused.length} · 待生成 ${slots.length - reused.length}`}
                  </span>
                </div>
                {isUpload ? (
                  <div className="image-upload-stage">
                    <label>
                      图片实际用途
                      <select
                        aria-label="上传图片用途"
                        disabled={!!parentAsset || busy}
                        value={parentAsset?.purposeId ?? draft.uploadPurposeId}
                        onChange={(e) => update({ uploadPurposeId: e.target.value })}
                      >
                        {config.purposes
                          .filter((p) => p.contentMode !== 'upload')
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {uploadIssue && <p role="alert">{uploadIssue}</p>}
                    {preview ? (
                      <>
                        <img src={preview.url} alt="待上传图片预览" />
                        <p>{preview.file.name}</p>
                        <p className="small mono">
                          {preview.width} × {preview.height} · {(preview.file.size / 1024 / 1024).toFixed(2)} MB ·
                          未上传
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="upload-mark mono">↑</span>
                        <h3>把已有图片加入素材库</h3>
                        <p className="small">PNG / JPEG · 单张不超过 {config.uploadMaxMB} MB</p>
                      </>
                    )}
                    <Button onClick={() => uploadRef.current?.click()}>选择本地图片</Button>
                    <Button
                      disabled={!data.storageReady || !preview || !uploadPurpose || !!uploadIssue || busy}
                      disabledReason={
                        !data.storageReady
                          ? '素材保存暂不可用。'
                          : uploadIssue || '请选择图片及用途，等待当前操作完成。'
                      }
                      onClick={() => void upload()}
                    >
                      上传并入库
                    </Button>
                  </div>
                ) : (
                  <div className="image-output-grid">
                    {slots.map((slot) => {
                      const asset = data.assets.find((a) => a.id === draft.existingAssets[slot.key]);
                      return (
                        <div className="image-output" key={slot.key}>
                          <div className="image-output-head">
                            <strong>{slot.label}</strong>
                            <span className="small mono">{slot.ratio}</span>
                          </div>
                          <div className="image-output-preview">
                            {asset ? (
                              <AssetImage src={assetUrl(asset)} alt={asset.title} />
                            ) : (
                              <span role={activeTask ? 'status' : undefined}>
                                {activeTask ? '正在生成图片…' : '尚未生成，可选择已有图'}
                              </span>
                            )}
                          </div>
                          {slot.key.startsWith('paragraph') && <p className="slot-paragraph">{slot.text}</p>}
                          <div className="image-slot-actions">
                            <span className="small">{asset ? '复用已有素材' : '尚未配图'}</span>
                            <Button onClick={() => setPickSlot(slot.key)}>选择已有图</Button>
                            {asset && (
                              <Button
                                onClick={() => {
                                  const next = { ...draft.existingAssets };
                                  delete next[slot.key];
                                  update({ existingAssets: next });
                                }}
                              >
                                取消复用
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!slots.length && <Empty>粘贴正文后，按段落列出配图位置</Empty>}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="asset-filters">
                  {draft.contentId && (
                    <label>
                      <input type="checkbox" checked={allWorks} onChange={(e) => setAllWorks(e.target.checked)} />
                      查看其他作品素材
                    </label>
                  )}
                  <input
                    type="search"
                    aria-label="搜索素材"
                    placeholder="搜索素材名称与提示词"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    aria-label="筛选素材用途"
                    value={purposeFilter}
                    onChange={(e) => setPurposeFilter(e.target.value)}
                  >
                    <option value="all">全部用途</option>
                    {config.purposes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="筛选素材来源"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value)}
                  >
                    <option value="all">全部来源</option>
                    <option value="ai">AI 生成</option>
                    <option value="upload">用户上传</option>
                  </select>
                  <label>
                    <input type="checkbox" checked={selectedOnly} onChange={(e) => setSelectedOnly(e.target.checked)} />
                    仅选定版
                  </label>
                </div>
                <div className="asset-grid">
                  {assets.map((asset) => (
                    <article className="asset-result" key={asset.id}>
                      <Button
                        title={asset.title}
                        className={`asset-tile ${assetId === asset.id ? 'active' : ''}`}
                        key={asset.id}
                        onClick={() => setAssetId(asset.id)}
                      >
                        <AssetImage src={assetUrl(asset)} alt={asset.title} />
                        <strong>{asset.title}</strong>
                        <span className="small">
                          {purposeName(asset.purposeId)} · {asset.ratio} · V{asset.version}
                        </span>
                        <span className="asset-selection">{asset.selected ? '已选定' : '未选定'}</span>
                      </Button>
                      <Button
                        className="asset-edit-overlay"
                        onClick={() => {
                          prepareEdit(asset);
                          setAssetId('');
                        }}
                      >
                        改这张
                      </Button>
                    </article>
                  ))}
                </div>
                {!assets.length && (
                  <Empty>{data.assets.length ? '没有符合筛选条件的素材' : '暂无素材，生成或上传后出现'}</Empty>
                )}
              </>
            )}
          </Card>
          {parentAsset && (
            <Card title="修改图片">
              <div className="image-revision">
                <div className="revision-original">
                  {parentAsset ? (
                    <>
                      <AssetImage src={assetUrl(parentAsset)} alt={`修改原图：${parentAsset.title}`} />
                      <span className="small">
                        原图 V{parentAsset.version} · {parentAsset.ratio}
                      </span>
                    </>
                  ) : (
                    <Empty>在素材库选一张图片改这张</Empty>
                  )}
                </div>
                <div className="revision-input">
                  <label htmlFor="image-edit">
                    用自然语言描述这次修改
                    <textarea
                      id="image-edit"
                      value={draft.editInstruction}
                      onChange={(e) => update({ editInstruction: e.target.value })}
                      rows={3}
                      placeholder="例如：保留主体，把标题放到上方，增加留白"
                    />
                  </label>
                  <div>
                    <Button
                      disabled={!parentAsset || !draft.editInstruction.trim() || !canGenerate}
                      disabledReason={
                        !data.generationReady ? '改图服务暂不可用。' : '请先选择原图并填写修改要求，等待当前操作完成。'
                      }
                      onClick={() => void generate()}
                    >
                      生成修改版
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
          <details className="card">
            <summary>继续已存草稿 →</summary>{' '}
            <Card title="任务草稿" meta={<span className="eyebrow">{data.drafts.length} 份</span>}>
              {data.drafts.length ? (
                <div className="image-drafts">
                  {data.drafts.map((saved) => (
                    <div key={saved.id}>
                      <Button
                        className="list-row"
                        disabled={busy}
                        disabledReason="正在处理，请稍候。"
                        onClick={() => requestLoad(saved)}
                      >
                        <strong>{saved.title}</strong>
                        <span>
                          {purposeName(saved.purposeId)} · {saved.updatedAt.slice(0, 10)}
                        </span>
                      </Button>
                      <ArchiveButton kind="image_draft" id={saved.id} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>{data.storageReady ? '暂无已保存草稿' : '暂无已保存草稿'}</Empty>
              )}
            </Card>
          </details>
        </section>
        {focusedAsset && (
          <Dialog className="asset-drawer" title="素材详情" onClose={() => setAssetId('')}>
            {focusedAsset ? (
              <>
                <AssetImage className="asset-detail-image" src={assetUrl(focusedAsset)} alt={focusedAsset.title} />
                <h3>{focusedAsset.title}</h3>
                <dl className="image-metadata">
                  {[
                    ['用途', purposeName(focusedAsset.purposeId)],
                    ['尺寸', `${focusedAsset.width} × ${focusedAsset.height}`],
                    ['比例', focusedAsset.ratio],
                    ['来源', focusedAsset.source === 'ai' ? 'AI 生成' : '用户上传'],
                    ['关联选题', data.topics.find((t) => t.id === focusedAsset.topicId)?.title ?? '未关联'],
                    ['关联作品', data.contents.find((c) => c.id === focusedAsset.contentId)?.title ?? '未关联'],
                    ['创建时间', inboxTime(focusedAsset.createdAt)],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="section-label">提示词 / 素材说明</p>
                <p className="asset-prompt">{focusedAsset.prompt || '未填写'}</p>
                <div className="asset-detail-actions">
                  <a className="button" href={assetUrl(focusedAsset)} download>
                    下载原图 →
                  </a>
                  <Button
                    disabled={busy}
                    disabledReason="正在处理，请稍候。"
                    onClick={() =>
                      setMetadata({
                        asset: focusedAsset,
                        title: focusedAsset.title,
                        purposeId: focusedAsset.purposeId,
                        topicId: focusedAsset.topicId,
                        contentId: focusedAsset.contentId,
                      })
                    }
                  >
                    改名、用途与关联
                  </Button>
                  <Button
                    disabled={busy}
                    disabledReason="正在处理，请稍候。"
                    onClick={() => {
                      prepareEdit(focusedAsset);
                      setAssetId('');
                    }}
                  >
                    改这张
                  </Button>
                  <Button
                    disabled={busy}
                    disabledReason="正在处理，请稍候。"
                    onClick={() => {
                      setUploadRevision(true);
                      update({
                        purposeId: config.purposes.find((p) => p.contentMode === 'upload')!.id,
                        parentAssetId: focusedAsset.id,
                        title: focusedAsset.title,
                        topicId: focusedAsset.topicId,
                        contentId: focusedAsset.contentId,
                        prompt: focusedAsset.prompt,
                      });
                      setTab('outputs');
                    }}
                  >
                    上传新版本
                  </Button>
                </div>

                <ArchiveButton kind="asset" id={focusedAsset.id} onArchived={() => setAssetId('')} />
                <p className="section-label">版本记录</p>
                <div className="asset-versions">
                  {versions.map((asset) => (
                    <div key={asset.id}>
                      <Button onClick={() => setAssetId(asset.id)} variant="text">
                        V{asset.version} · {asset.createdAt.slice(0, 10)}
                      </Button>
                      {asset.selected &&
                      (!asset.contentId ||
                        asset.purposeId !== 'video_cover' ||
                        Object.values(data.contents.find((c) => c.id === asset.contentId)?.videoCovers ?? {}).includes(
                          asset.id,
                        )) ? (
                        <Tag>已选定</Tag>
                      ) : (
                        <Button
                          disabled={
                            (asset.selected &&
                              (!asset.contentId ||
                                asset.purposeId !== 'video_cover' ||
                                Object.values(
                                  data.contents.find((c) => c.id === asset.contentId)?.videoCovers ?? {},
                                ).includes(asset.id))) ||
                            !data.storageReady ||
                            (!!asset.contentId && !data.contentWriteReady) ||
                            busy
                          }
                          disabledReason={
                            !data.storageReady || (asset.contentId && !data.contentWriteReady)
                              ? '素材或作品保存暂不可用。'
                              : busy
                                ? '正在处理，请稍候。'
                                : '此版本已选定。'
                          }
                          onClick={() => void selectVersion(asset)}
                        >
                          选定此版
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="asset-detail-empty">
                <Empty>在素材库选择图片，查看详情和版本</Empty>
                <dl className="image-metadata">
                  {['用途与比例', '关联选题 / 作品', '来源与提示词', '版本与选定状态'].map((label) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>--</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </Dialog>
        )}
      </div>
      <input
        className="sr-only"
        ref={uploadRef}
        type="file"
        accept={config.acceptedTypes.join(',')}
        onChange={(e) => void chooseFile(e)}
        aria-label="选择上传图片"
      />

      {metadata && (
        <Dialog
          title="素材用途与关联"
          onClose={() => {
            if (!busy) setMetadata(null);
          }}
        >
          <div className="image-form">
            <label>
              素材名称
              <input
                aria-label="素材名称"
                disabled={busy}
                value={metadata.title}
                onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
              />
            </label>
            <label>
              实际用途
              <select
                aria-label="素材实际用途"
                disabled={busy}
                value={metadata.purposeId}
                onChange={(e) => setMetadata({ ...metadata, purposeId: e.target.value })}
              >
                {metadata.purposeId === 'upload' && <option value="upload">请选择实际用途</option>}
                {config.purposes
                  .filter((p) => p.contentMode !== 'upload')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <ContentPicker
              sessionId="asset-metadata"
              value={metadata.contentId}
              disabled={busy}
              onChange={(id, content) => setMetadata({ ...metadata, contentId: id, topicId: content?.topicId ?? null })}
            />

            {notice && <p role="status">{notice}</p>}
          </div>
        </Dialog>
      )}
      <details className="card">
        <summary>最近生图记录 →</summary>
        {(data.tasks ?? []).slice(0, 5).map((task) => (
          <p key={task.id} className="small">
            {task.input.title} ·{' '}
            {
              {
                queued: '等待后台启动',
                running: '生成中，关闭页面仍会继续',
                success: '已完成并进入素材库',
                failed: '失败',
              }[task.status]
            }
            {task.reason ? ` · ${task.reason}` : ''}
          </p>
        ))}
        {(data.generations ?? []).length ? (
          (data.generations ?? []).slice(0, 10).map((run) => (
            <p key={run.id} className="small mono">
              {new Date(run.startedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} ·{' '}
              {run.kind === 'edit' ? '修改' : run.kind === 'chat' ? '对话' : '生成'} · {run.calls} 次 ·{' '}
              {run.durationMs === null ? '--' : Math.round(run.durationMs / 1000) + '秒'} ·{' '}
              {run.status === 'success' ? '成功' : run.status === 'running' ? '进行中' : '失败'}
              {run.reason ? '：' + run.reason : ''}
            </p>
          ))
        ) : (
          <Empty>还没有生图记录</Empty>
        )}
      </details>
      {pickSlot !== null && (
        <Dialog title="选择已有素材" onClose={() => setPickSlot(null)}>
          <p className="dialog-intro">优先使用已有图片；保留原尺寸，不自动裁剪。</p>
          {pickableAssets.length ? (
            <div className="asset-picker">
              {pickableAssets.map((asset) => (
                <Button
                  key={asset.id}
                  onClick={() => {
                    update({ existingAssets: { ...draft.existingAssets, [pickSlot]: asset.id } });
                    setPickSlot(null);
                  }}
                >
                  <AssetImage src={assetUrl(asset)} alt={asset.title} />
                  <span>
                    {asset.title} · {asset.ratio}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty>素材库暂无图片</Empty>
          )}
        </Dialog>
      )}
      {cropId && pendingCrops.find((c) => c.id === cropId) && (
        <ManualCropDialog
          crop={pendingCrops.find((c) => c.id === cropId)!}
          onClose={() => setCropId(null)}
          onSaved={() => {
            setTab('library');
            setPurposeFilter('all');
            void refresh();
          }}
        />
      )}
    </main>
  );
}
