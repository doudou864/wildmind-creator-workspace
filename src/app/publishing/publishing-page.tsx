'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentPicker } from '@/ui/content-picker';
import { useEditSession } from '@/ui/use-edit-session';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Platform } from '@/lib/config';
import type { LayoutConfig } from '@/lib/layout-model';
import {
  publishMaterialKey,
  platformMaterialKey,
  autoVideoCovers,
  canRetryPublishReceipt,
  defaultPublishTime,
  generatePublishSetting,
  updateCommonCopy,
  restorePublishSetting,
  formatPublishTags,
  publishSettingIssues,
  readyPublishReceipts,
  receiptStatus,
  uploadPlatformIds,
  newPublishDraft,
  publishDraftSchema,
  publishIssues,
  type PublishBatch,
  type PublishDraft,
  type PublishKind,
  type PublishReceipt,
  type PublishSetting,
  type PublishSnapshot,
  type PublishingConfig,
  type PublishingData,
} from '@/lib/publishing-model';
import { Button, Card, Dialog, Empty } from '@/ui/components';
import { AssetImage } from '@/ui/asset-image';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { LayoutPreview } from '@/ui/layout-preview';
import { request, useResource } from '@/ui/use-resource';
type LocalMedia = { file: File; url: string };
const statusNames = {
  uploading: '上传中',
  ready: '已就绪待发布',
  expired: '已过期，需重新上传',
  queued: '等待执行',
  submitting: '发布中',
  pending_review: '平台审核中',
  published: '已发布',
  failed: '失败',
  unknown: '结果待核对',
};
const batchNames = {
  uploading: '正在上传',
  prepared: '待截图审核',
  draft: '准备中',
  queued: '已排队',
  running: '执行中',
  finished: '已结束',
};
const modes = [
  { value: 'video' as const, label: '视频发布' },
  { value: 'layout' as const, label: '排版确认稿' },
  { value: 'xhs' as const, label: '小红书图文' },
];
export default function PublishingPage({
  config,
  layoutConfig,
  platforms,
  initialData,
  today,
  syncWindow,
  expiryHours,
  initialContent = null,
  initialKind = 'video',
}: {
  initialContent?: string | null;
  initialKind?: PublishKind;
  config: PublishingConfig;
  layoutConfig: LayoutConfig;
  platforms: Platform[];
  initialData: PublishingData;
  today: string;
  syncWindow: string;
  expiryHours: number;
}) {
  const router = useRouter();
  const { data, error, refresh } = useResource('/api/publishing', initialData);
  const [draft, setDraft] = useState<PublishDraft>(() => ({
    ...newPublishDraft(initialKind),
    contentId: initialContent,
  }));
  const [meta, setMeta] = useState<PublishBatch | null>(null);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [local, setLocal] = useState<LocalMedia[]>([]),
    [mediaLoading, setMediaLoading] = useState(false);
  const urls = useRef<string[]>([]),
    sequence = useRef(0);
  const [instruction, setInstruction] = useState('');
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [picker, setPicker] = useState(false),
    [search, setSearch] = useState('');
  const [preview, setPreview] = useState<PublishSnapshot | null>(null);
  const [returning, setReturning] = useState<PublishSnapshot | null>(null);
  const [review, setReview] = useState<{
    draft: PublishDraft;
    requestId: string;
    materials: string;
    receiptKey: string;
  } | null>(null);
  const retryRequest = useRef('');
  const [screenshotAttempt, setScreenshotAttempt] = useState(0);
  const [loadedScreenshots, setLoadedScreenshots] = useState<string[]>([]);
  function screenshotLoaded(id: string) {
    setNotice((value) => (value === '后台截图无法读取，请刷新重试；截图可见后才能确认发布。' ? '' : value));
    setLoadedScreenshots((ids) => (ids.includes(id) ? ids : [...ids, id]));
  }
  function screenshotFailed(id: string) {
    setLoadedScreenshots((ids) => ids.filter((value) => value !== id));
    setNotice('后台截图无法读取，请刷新重试；截图可见后才能确认发布。');
  }
  const uploadRequest = useRef<{ key: string; id: string } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, { key: string; open: boolean }>>({});
  const [checked, setChecked] = useState(false),
    [retry, setRetry] = useState<PublishReceipt | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sessionDirty = useEditSession(
    `publishing:${initialContent ?? 'new'}:${initialKind}`,
    { draft, meta, local, instruction },
    dirty,
    (saved) => {
      setDraft(saved.draft);
      setMeta(saved.meta);
      setLocal(saved.local);
      urls.current = saved.local.map((v) => v.url);
      setInstruction(saved.instruction);
      setDirty(true);
      setNotice('已恢复本窗口未保存的发布准备；尚未提交发布。');
    },
  );
  const liveBatch = data.batches.find((batch) => batch.id === meta?.id);
  const stale = !!meta && !!liveBatch && (liveBatch.revision !== meta.revision || liveBatch.state !== meta.state);
  const locked = !!meta && ['uploading', 'queued', 'running', 'finished'].includes(meta.state);
  const liveRetry = data.receipts.find((receipt) => receipt.id === retry?.id);
  const retryAllowed =
    !dirty &&
    !stale &&
    !!retry &&
    !!liveRetry &&
    liveRetry.revision === retry.revision &&
    canRetryPublishReceipt(liveRetry, draft, data, config, Date.now(), expiryHours, platforms) &&
    !!liveRetry.screenshotAssetId &&
    loadedScreenshots.includes(liveRetry.screenshotAssetId);
  const name = (id: string) => platforms.find((p) => p.id === id)?.name ?? id;
  const assetUrl = (id: string) => `/api/images/assets/${encodeURIComponent(id)}/file`;
  const issues = publishIssues(draft, data, config, platforms, now);
  const covers = autoVideoCovers(
    draft.contentId,
    data.assets,
    config,
    data.contents.find((c) => c.id === draft.contentId)?.videoCovers,
  );
  const snapshots = data.snapshots.filter((s) => s.contentId === draft.contentId && s.state === 'ready');
  const saved = !!meta && !dirty && !local.length;
  const eligibleTemplates = config.templates.filter((t) => t.kinds.includes(draft.kind));
  const currentVideo = data.videos.find((v) => v.id === draft.videoId);
  async function copyText(item: PublishSetting) {
    const snapshot = data.snapshots.find((s) => draft.snapshotIds.includes(s.id) && s.platform === item.platformId);
    const body = snapshot
      ? snapshot.content.blocks
          .filter((b) => b.type !== 'image')
          .map((b) => b.text)
          .join('\n\n')
      : item.description;
    try {
      await navigator.clipboard.writeText(
        [item.title, body, formatPublishTags(item.tags, item.platformId, config)].filter(Boolean).join('\n\n'),
      );
      setNotice(`${name(item.platformId)}文案已复制，尚未发布。`);
    } catch {
      setNotice('复制失败，可直接选择文本复制。');
    }
  }
  const materials = publishMaterialKey(draft, data, config);
  const readyReceipts = meta ? readyPublishReceipts(meta.id, draft, data, config, platforms, now, expiryHours) : [];
  const receiptKey = JSON.stringify(
    readyReceipts.map((r) => ({
      id: r.id,
      revision: r.revision,
      screenshotAssetId: r.screenshotAssetId,
      uploadedAt: r.uploadedAt,
    })),
  );
  const materialChanged = !!review && (review.materials !== materials || review.receiptKey !== receiptKey);
  const uploadTargets = uploadPlatformIds(meta?.id ?? null, draft, data, config, now, expiryHours);
  const canUpload =
    saved && !locked && !stale && !busy && data.uploadReady && !issues.length && uploadTargets.length > 0;
  useEffect(() => {
    setChecked(false);
  }, [materials, receiptKey]);
  const canPublish =
    !materialChanged &&
    saved &&
    !locked &&
    !stale &&
    !busy &&
    data.publishReady &&
    readyReceipts.length > 0 &&
    readyReceipts.every((r) => loadedScreenshots.includes(r.screenshotAssetId!));
  useEffect(() => {
    if (liveBatch && !dirty && (liveBatch.revision !== meta?.revision || liveBatch.state !== meta?.state)) {
      setMeta(liveBatch);
      setDraft(structuredClone(liveBatch.draft));
    }
  }, [liveBatch, dirty, meta?.revision, meta?.state]);
  const inFlight = data.receipts.some(
    (r) => r.batchId === meta?.id && ['queued', 'uploading', 'submitting'].includes(r.status),
  );
  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [inFlight, refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(
    () => () => {
      sequence.current++;
      if (!sessionDirty.current) urls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [sessionDirty],
  );
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const intercept = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as HTMLElement).closest('a');
      if (!link || link.target === '_blank' || link.href === window.location.href || link.hasAttribute('download'))
        return;
      event.preventDefault();
      event.stopPropagation();
      setPending(() => () => {
        setDirty(false);
        window.setTimeout(() => router.push(link.href), 0);
      });
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', intercept, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', intercept, true);
    };
  }, [dirty]);
  function clearMedia() {
    sequence.current++;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    setLocal([]);
    setMediaLoading(false);
  }
  function protect(action: () => void) {
    if (dirty) setPending(() => action);
    else action();
  }
  function fresh(kind: PublishKind) {
    clearMedia();
    setDraft(newPublishDraft(kind));
    setMeta(null);
    setDirty(false);
    setInstruction('');
    setNotice('');
  }
  function change(patch: Partial<PublishDraft>) {
    if (locked || busy) return;
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setNotice('');
  }
  function setting(platformId: string, patch: Partial<PublishSetting>) {
    change({
      settings: draft.settings.map((s) =>
        s.platformId === platformId ? { ...s, ...patch, individuallyEdited: true } : s,
      ),
    });
  }
  function toggle(platformId: string) {
    const existing = draft.settings.some((s) => s.platformId === platformId);
    if (existing) {
      change({
        settings: draft.settings.filter((s) => s.platformId !== platformId),
        snapshotIds: draft.snapshotIds.filter((id) => data.snapshots.find((s) => s.id === id)?.platform !== platformId),
      });
      return;
    }
    const snapshot = snapshots.find((s) => s.platform === platformId);
    const item = generatePublishSetting(platformId, draft, data, config, Date.now());
    change({
      settings: [...draft.settings, item],
      snapshotIds: draft.kind === 'layout' && snapshot ? [...draft.snapshotIds, snapshot.id] : draft.snapshotIds,
    });
  }
  async function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const video = draft.kind === 'video';
    if (
      (video && files.length !== 1) ||
      (!video && files.length + draft.imageIds.length > config.xhsMaxImages) ||
      files.some(
        (f) =>
          !f.size ||
          f.size > (video ? config.videoMaxMB : config.imageMaxMB) * 1024 * 1024 ||
          !(video ? config.videoTypes : config.imageTypes).includes(f.type),
      )
    ) {
      setNotice(
        video
          ? `请选择 MP4 或 MOV，大小不超过 ${config.videoMaxMB} MB。`
          : `请选择 PNG / JPEG，每张不超过 ${config.imageMaxMB} MB，合计不超过 ${config.xhsMaxImages} 张。`,
      );
      return;
    }
    const token = ++sequence.current;
    setMediaLoading(true);
    const selected = files.map((file) => ({ file, url: URL.createObjectURL(file) }));
    try {
      if (!video)
        await Promise.all(
          selected.map(async (item) => {
            const img = new Image();
            img.src = item.url;
            await img.decode();
          }),
        );
      if (token !== sequence.current) {
        selected.forEach((item) => URL.revokeObjectURL(item.url));
        return;
      }
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = selected.map((item) => item.url);
      setLocal(selected);
      if (video) change({ videoId: null });
      setDirty(true);
      setNotice('文件仅在本页预览，尚未上传或保存。');
    } catch {
      selected.forEach((item) => URL.revokeObjectURL(item.url));
      if (token === sequence.current) setNotice('图片无法读取，原有选择已保留。');
    } finally {
      if (token === sequence.current) setMediaLoading(false);
    }
  }
  async function upload() {
    if (!data.storageReady || !draft.contentId || !local.length || busy || locked) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('metadata', JSON.stringify({ kind: draft.kind, contentId: draft.contentId }));
      local.forEach((item) => form.append('files', item.file));
      const result = await request<{ videoId: string | null; assetIds: string[] }>('/api/publishing/media', {
        method: 'POST',
        body: form,
      });
      setDraft((d) => ({ ...d, videoId: result.videoId ?? d.videoId, imageIds: [...d.imageIds, ...result.assetIds] }));
      clearMedia();
      await refresh();
      setNotice('文件已保存，发布准备仍需保存。');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '上传失败，文件预览已保留。');
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!data.storageReady || busy || locked || stale || local.length) return;
    if (!publishDraftSchema.safeParse(draft).success) {
      setNotice('发布内容格式有误，请检查标题、话题标签和时间。');
      return;
    }
    setBusy(true);
    try {
      const result = await request<PublishBatch>(
        meta ? `/api/publishing/drafts/${encodeURIComponent(meta.id)}` : '/api/publishing/drafts',
        {
          method: meta ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...draft, ...(meta ? { expectedRevision: meta.revision } : {}) }),
        },
      );
      setMeta(result);
      setDraft(result.draft);
      setDirty(false);
      setNotice('发布准备已保存，尚未发布。');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '保存失败，填写内容已保留。');
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: 'upload' | 'publish-all' | 'ai' | 'return', snapshotId?: string, onlyPlatform?: string) {
    if (!meta || busy || dirty || locked || stale) return;
    const time = Date.now();
    const ready = readyPublishReceipts(meta.id, draft, data, config, platforms, time, expiryHours);
    if (
      kind === 'publish-all' &&
      (!canPublish ||
        !review ||
        !checked ||
        JSON.stringify(
          ready.map((r) => ({
            id: r.id,
            revision: r.revision,
            screenshotAssetId: r.screenshotAssetId,
            uploadedAt: r.uploadedAt,
          })),
        ) !== review.receiptKey)
    ) {
      setNow(time);
      return;
    }
    if (kind === 'upload' && (!canUpload || publishIssues(draft, data, config, platforms, time).length)) return;
    if (kind === 'ai' && !data.aiReady) return;
    if (kind === 'return' && !data.handoffReady) return;
    const targets = uploadPlatformIds(meta.id, draft, data, config, time, expiryHours).filter(
      (id) => !onlyPlatform || id === onlyPlatform,
    );
    if (kind === 'upload' && !targets.length) return;
    const key = JSON.stringify({ batch: meta.id, revision: meta.revision, materials, targets });
    if (!uploadRequest.current || uploadRequest.current.key !== key)
      uploadRequest.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const payload = {
        action: kind,
        expectedRevision: meta.revision,
        ...(kind === 'publish-all'
          ? {
              confirmed: true,
              requestId: review!.requestId,
              materials: review!.materials,
              receipts: ready.map((r) => ({ id: r.id, expectedRevision: r.revision })),
            }
          : kind === 'upload'
            ? { requestId: uploadRequest.current.id, platformIds: targets, materials }
            : kind === 'ai'
              ? {
                  instruction: instruction.trim() || '根据关联作品生成通用标题、简介和话题，保留已单独修改的平台版本。',
                }
              : { snapshotId }),
      };
      const result = await request<PublishBatch>(`/api/publishing/drafts/${encodeURIComponent(meta.id)}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setMeta(result);
      setDraft(result.draft);
      setReview(null);
      setReturning(null);
      setDirty(false);
      setNotice(
        kind === 'publish-all'
          ? '发布任务已受理，请以逐平台回执为准。'
          : kind === 'upload'
            ? '上传任务已受理；完成后请检查各平台截图，尚未发布。'
            : kind === 'return'
              ? '确认稿已退回排版中心。'
              : '通用文案已更新；已单独修改的平台保持不变。',
      );
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '操作失败，原状态已保留。');
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function retryReceipt() {
    if (
      !retry ||
      busy ||
      !data.publishReady ||
      !retryAllowed ||
      !liveRetry ||
      !canRetryPublishReceipt(liveRetry, draft, data, config, Date.now(), expiryHours, platforms)
    )
      return;
    setBusy(true);
    try {
      await request(`/api/publishing/receipts/${encodeURIComponent(retry.id)}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: retry.revision,
          confirmed: true,
          requestId: retryRequest.current,
          materials: platformMaterialKey(draft, retry.platformId, data, config),
        }),
      });
      setRetry(null);
      setNotice('重试已受理，请查看回执。');
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '重试未执行');
    } finally {
      setBusy(false);
    }
  }
  function loadBatch(batch: PublishBatch) {
    clearMedia();
    setDraft(structuredClone(batch.draft));
    setMeta(batch);
    setDirty(false);
    setInstruction('');
    setNotice('已打开保存的发布批次。');
  }
  return (
    <main className="workspace publishing-workspace">
      <WorkspaceHeader current="/publishing" date={today} syncWindow={syncWindow} />
      <div className="modebar">
        <span className="eyebrow">05 · PUBLISHING DESK</span>
        <span>{data.message}</span>
      </div>
      <div className="topics-heading">
        <div>
          <h1>发布中心</h1>
          <p>文案只写一次。先上传看截图，再一次确认发布。</p>
        </div>
        <div className="image-heading-actions">
          <span className="small">{dirty ? '有未保存的准备内容' : meta ? batchNames[meta.state] : '新建发布准备'}</span>
          <Button
            disabled={busy}
            onClick={() => {
              setLoadedScreenshots([]);
              setScreenshotAttempt((n) => n + 1);
              void refresh();
            }}
          >
            刷新资料
          </Button>
          <Button disabled={busy} onClick={() => protect(() => fresh(draft.kind))}>
            新建批次
          </Button>
          <Button
            disabled={!data.storageReady || !dirty || busy || locked || stale || !!local.length || !draft.contentId}
            onClick={() => void save()}
          >
            保存准备
          </Button>
        </div>
      </div>
      <div className="publish-mode" role="group" aria-label="发布来源">
        {modes.map((mode, i) => (
          <button
            key={mode.value}
            className={draft.kind === mode.value ? 'active' : ''}
            aria-pressed={draft.kind === mode.value}
            disabled={busy}
            onClick={() => {
              if (mode.value !== draft.kind) protect(() => fresh(mode.value));
            }}
          >
            <span className="eyebrow">0{i + 1}</span>
            <strong>{mode.label}</strong>
            <span>
              {mode.value === 'video'
                ? '上传成片 · 自动带出三比例封面'
                : mode.value === 'layout'
                  ? '接收确认版本 · 内容只读'
                  : '上传自制图片 · 套用发布模板'}
            </span>
          </button>
        ))}
      </div>
      {stale && liveBatch && (
        <p className="topic-feedback" role="alert">
          这份批次已在其他页面更新，当前编辑已保留。
          <Button disabled={busy} onClick={() => protect(() => loadBatch(liveBatch))}>
            载入最新批次
          </Button>
        </p>
      )}
      {notice && (
        <p className="topic-feedback" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="topic-feedback" role="alert">
          {error}
        </p>
      )}
      <div className="publish-grid">
        <aside className="publish-source">
          <Card index="01" title="内容来源" meta={<span className="eyebrow">SOURCE</span>}>
            <div className="image-form">
              <ContentPicker
                value={draft.contentId}
                form={draft.kind === 'video' ? '视频' : '图文'}
                disabled={locked || busy}
                onChange={(id) =>
                  protect(() => {
                    clearMedia();
                    setDraft({
                      ...newPublishDraft(draft.kind),
                      contentId: id,
                      commonCopy: {
                        title: data.contents.find((c) => c.id === id)?.title ?? '',
                        description: '',
                        tags: [],
                      },
                    });
                    setMeta(null);
                    setDirty(true);
                    setInstruction('');
                    void refresh();
                  })
                }
              />
              {draft.kind === 'video' && (
                <>
                  <label>
                    已保存成片
                    <select
                      aria-label="已保存成片"
                      value={draft.videoId ?? ''}
                      disabled={!draft.contentId || locked || busy}
                      onChange={(e) => {
                        clearMedia();
                        change({ videoId: e.target.value || null });
                      }}
                    >
                      <option value="">请选择成片</option>
                      {data.videos
                        .filter((v) => v.contentId === draft.contentId)
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="publish-upload">
                    选择本机成片
                    <input
                      aria-label="选择本机成片"
                      type="file"
                      accept={config.videoTypes.join(',')}
                      disabled={busy || locked || mediaLoading}
                      onChange={(e) => void chooseFiles(e)}
                    />
                    <span className="small">MP4 / MOV · 最大 {config.videoMaxMB} MB</span>
                  </label>
                  {local[0] || currentVideo ? (
                    <div className="publish-video">
                      <video
                        key={local[0]?.url ?? currentVideo?.id}
                        controls
                        preload="metadata"
                        src={local[0]?.url ?? `/api/publishing/media/${encodeURIComponent(currentVideo!.id)}/file`}
                        onError={() => setNotice('成片暂时无法播放；请检查文件格式或存储服务。')}
                      />
                      <p className="small">
                        {local[0]
                          ? `${local[0].file.name} · ${(local[0].file.size / 1024 / 1024).toFixed(1)} MB · 尚未上传`
                          : currentVideo?.name}
                      </p>
                    </div>
                  ) : (
                    <Empty>尚未选择成片</Empty>
                  )}
                </>
              )}
              {draft.kind === 'layout' && (
                <>
                  <p className="small">这里只接收排版中心送来的确认快照，正文、封面和插图均不可编辑。</p>
                  {snapshots.length ? (
                    snapshots.map((s) => (
                      <div className="publish-snapshot" key={s.id}>
                        <strong>
                          {name(s.platform)} · {s.content.title}
                        </strong>
                        <span className="small">排版修订 {s.layoutRevision} · 已人工确认</span>
                        <div>
                          <Button onClick={() => setPreview(s)}>查看确认稿</Button>
                          <Link
                            href={`/layouts?layout=${encodeURIComponent(s.layoutId)}&content=${encodeURIComponent(s.contentId)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            查看排版稿 →
                          </Link>
                          <Button
                            disabled={
                              !data.handoffReady || !saved || busy || locked || !draft.snapshotIds.includes(s.id)
                            }
                            onClick={() => setReturning(s)}
                          >
                            退回修改
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty>暂无这条作品的待发布确认稿</Empty>
                  )}
                  <Link
                    href={`/layouts?${new URLSearchParams(draft.contentId ? { content: draft.contentId } : {})}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    去排版中心准备 →
                  </Link>
                </>
              )}
              {draft.kind === 'xhs' && (
                <>
                  <p className="small">仅使用自己制作并上传的图片，不从 AI 生图中自动选图。</p>
                  <label className="publish-upload">
                    选择本机图片
                    <input
                      aria-label="选择本机图文图片"
                      type="file"
                      accept={config.imageTypes.join(',')}
                      multiple
                      disabled={busy || locked || mediaLoading}
                      onChange={(e) => void chooseFiles(e)}
                    />
                    <span className="small">
                      PNG / JPEG · 每张 {config.imageMaxMB} MB · 工作台上限 {config.xhsMaxImages} 张
                    </span>
                  </label>
                  <Button
                    disabled={busy || locked}
                    onClick={() => {
                      setSearch('');
                      setPicker(true);
                    }}
                  >
                    从已上传素材选择
                  </Button>
                  <div className="publish-photos">
                    {draft.imageIds.map((id, i) => {
                      const a = data.assets.find((a) => a.id === id);
                      return (
                        <div key={id}>
                          <AssetImage src={assetUrl(id)} alt={a?.title ?? '素材缺失'} />
                          <span className="small">
                            {i + 1} · {a?.title ?? '素材缺失'}
                          </span>
                          <div>
                            <Button
                              aria-label={`第${i + 1}张前移`}
                              disabled={i === 0 || busy || locked}
                              onClick={() => {
                                const ids = [...draft.imageIds];
                                [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                                change({ imageIds: ids });
                              }}
                            >
                              ←
                            </Button>
                            <Button
                              disabled={busy || locked}
                              onClick={() => change({ imageIds: draft.imageIds.filter((value) => value !== id) })}
                            >
                              移除
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {local.map((item, i) => (
                      <div key={item.url}>
                        <img src={item.url} alt={item.file.name} />
                        <span className="small">{draft.imageIds.length + i + 1} · 本页预览</span>
                        <Button
                          aria-label={`本机第${i + 1}张前移`}
                          disabled={i === 0 || busy}
                          onClick={() =>
                            setLocal((items) => {
                              const next = [...items];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              return next;
                            })
                          }
                        >
                          ← 前移
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() => {
                            URL.revokeObjectURL(item.url);
                            urls.current = urls.current.filter((url) => url !== item.url);
                            setLocal((items) => items.filter((v) => v.url !== item.url));
                          }}
                        >
                          移除
                        </Button>
                      </div>
                    ))}
                  </div>
                  {!draft.imageIds.length && !local.length && <Empty>尚未选择自制图片</Empty>}
                </>
              )}
              {draft.kind !== 'layout' && (
                <>
                  <Button
                    disabled={!local.length || !data.storageReady || !draft.contentId || busy || locked || mediaLoading}
                    onClick={() => void upload()}
                  >
                    {mediaLoading ? '正在读取文件…' : '上传并保存素材'}
                  </Button>
                  <p className="small">
                    {!data.storageReady
                      ? '上传服务待接入；本机文件仅在本页预览。'
                      : '先关联作品并上传素材，再保存发布准备。'}
                  </p>
                </>
              )}
            </div>
          </Card>
          {draft.kind === 'video' && (
            <Card index="02" title="作品封面" meta={<span className="eyebrow">AUTO MATCH</span>}>
              <p className="small publish-card-note">带出这条作品明确采用的封面版本；素材库选版不会自动替换。</p>
              <div className="publish-covers">
                {covers.map((cover) => (
                  <div key={cover.ratio}>
                    {cover.asset ? (
                      <AssetImage src={assetUrl(cover.asset.id)} alt={cover.asset.title} />
                    ) : (
                      <div className="publish-cover-empty mono">{cover.ratio}</div>
                    )}
                    <span className="mono small">{cover.ratio}</span>
                    <p className="small">{cover.asset ? `已带出 · V${cover.asset.version}` : cover.reason}</p>
                  </div>
                ))}
              </div>
              <Link
                href={`/images?${new URLSearchParams(draft.contentId ? { content: draft.contentId } : {})}`}
                target="_blank"
                rel="noreferrer"
              >
                去生图中心补齐或修改封面 →
              </Link>
            </Card>
          )}
        </aside>
        <section className="publish-settings">
          {draft.kind !== 'layout' && (
            <Card index="03" title="通用文案" meta={<span className="eyebrow">WRITE ONCE</span>}>
              <fieldset className="image-form" disabled={locked || busy}>
                <p className="small">填写一次，自动同步到未单独修改的平台；超长会标出，不会截断原文。</p>
                <label>
                  标题
                  <input
                    aria-label="通用标题"
                    maxLength={1000}
                    value={draft.commonCopy.title}
                    onChange={(e) =>
                      change(
                        updateCommonCopy(
                          draft,
                          { ...draft.commonCopy, title: e.target.value },
                          data,
                          config,
                          Date.now(),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  {draft.kind === 'xhs' ? '笔记正文' : '简介'}
                  <textarea
                    aria-label="通用简介"
                    rows={4}
                    maxLength={100000}
                    value={draft.commonCopy.description}
                    onChange={(e) =>
                      change(
                        updateCommonCopy(
                          draft,
                          { ...draft.commonCopy, description: e.target.value },
                          data,
                          config,
                          Date.now(),
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  话题标签
                  <input
                    aria-label="通用话题标签"
                    value={draft.commonCopy.tags.join(' ')}
                    onChange={(e) =>
                      change(
                        updateCommonCopy(
                          draft,
                          { ...draft.commonCopy, tags: e.target.value.split(' ') },
                          data,
                          config,
                          Date.now(),
                        ),
                      )
                    }
                    onBlur={() =>
                      change(
                        updateCommonCopy(
                          draft,
                          {
                            ...draft.commonCopy,
                            tags: draft.commonCopy.tags.map((t) => t.trim().replace(/^#+|#+$/g, '')).filter(Boolean),
                          },
                          data,
                          config,
                          Date.now(),
                        ),
                      )
                    }
                    placeholder="话题之间用空格分隔"
                  />
                </label>
                <label>
                  写作要求（可选）
                  <input
                    aria-label="AI 写作要求"
                    maxLength={10000}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                </label>
                <div className="publish-ai-actions">
                  <Button
                    disabled={!data.aiReady || !saved || locked || stale || busy}
                    onClick={() => void action('ai')}
                  >
                    AI 帮我写
                  </Button>
                  <span className="small">
                    {!data.aiReady ? 'AI 服务未接入' : !saved ? '请先保存准备内容' : '保留已单独修改的平台版本'}
                  </span>
                </div>
              </fieldset>
            </Card>
          )}
          <Card
            index="04"
            title="平台与发布模板"
            meta={<span className="eyebrow">{draft.settings.length} SELECTED</span>}
          >
            <div className="publish-platforms">
              {eligibleTemplates.map((template) => {
                const p = platforms.find((p) => p.id === template.platformId)!;
                const matches = snapshots.filter((s) => s.platform === p.id);
                const disabled = busy || locked || !p.active || (draft.kind === 'layout' && matches.length !== 1);
                return (
                  <label
                    key={p.id}
                    title={
                      !p.active
                        ? '平台尚未启用'
                        : draft.kind === 'layout' && matches.length !== 1
                          ? '需要唯一待发布确认稿'
                          : undefined
                    }
                  >
                    <input
                      type="checkbox"
                      checked={draft.settings.some((s) => s.platformId === p.id)}
                      disabled={disabled}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="mono">{p.code}</span>
                    {p.name}
                    {!p.active && <small>未启用</small>}
                  </label>
                );
              })}
            </div>
            <p className="small">
              勾选即生成平台版本。正常卡片默认收起，问题卡片自动展开；时间优先使用本月推荐，其次模板默认。
            </p>
          </Card>
          {!draft.settings.length ? (
            <Card index="—" title="平台版本">
              <Empty>选择平台后自动生成版本，无需重复填写文案</Empty>
            </Card>
          ) : (
            draft.settings.map((item) => {
              const template = config.templates.find((t) => t.platformId === item.platformId);
              const p = platforms.find((p) => p.id === item.platformId);
              const problems = publishSettingIssues(draft, item, data, config, platforms, now);
              const issueKey = JSON.stringify(problems);
              const state = expanded[item.platformId];
              const open = state?.key === issueKey ? state.open : problems.length > 0;
              return (
                <section
                  key={item.platformId}
                  className={`publish-platform-card card ${problems.length ? 'publish-warning' : ''}`}
                >
                  <button
                    className="publish-platform-summary"
                    aria-expanded={open}
                    aria-label={`${name(item.platformId)}平台版本`}
                    onClick={() =>
                      setExpanded((current) => ({ ...current, [item.platformId]: { key: issueKey, open: !open } }))
                    }
                  >
                    <strong>{p?.name ?? item.platformId}</strong>
                    <span className="publish-title-summary">{item.title || '待填写标题'}</span>
                    <span className="mono">
                      {draft.kind === 'video'
                        ? (template?.videoCoverRatio ?? '--')
                        : draft.kind === 'layout'
                          ? '确认稿'
                          : '自制图'}
                    </span>
                    <span className="mono">{item.scheduleAt?.replace('T', ' ') ?? '立即发布'}</span>
                    <span>
                      {item.individuallyEdited
                        ? '已单独修改'
                        : problems.length
                          ? '需处理'
                          : draft.kind === 'layout'
                            ? '确认稿只读'
                            : '跟随通用文案'}{' '}
                      · {open ? '收起' : '展开'}
                    </span>
                  </button>
                  {open && (
                    <div className="publish-platform-body">
                      {problems.length > 0 && (
                        <ul className="publish-problems">
                          {problems.map((problem) => (
                            <li key={problem}>{problem}</li>
                          ))}
                        </ul>
                      )}
                      <div className="publish-copy-action">
                        <span className="small">
                          {item.individuallyEdited
                            ? '已单独修改 · 不再随通用文案变化'
                            : draft.kind === 'layout'
                              ? '确认稿内容只读'
                              : '跟随通用文案'}
                        </span>
                        <Button onClick={() => void copyText(item)}>复制文案</Button>
                        <Button
                          disabled={!item.individuallyEdited || locked || busy}
                          onClick={() =>
                            change(restorePublishSetting(draft, item.platformId, data, config, Date.now()))
                          }
                        >
                          恢复为通用文案
                        </Button>
                      </div>
                      <fieldset disabled={locked || busy} className="image-form">
                        <label>
                          {draft.kind === 'layout' ? '确认稿标题（只读）' : '平台标题'}
                          <input
                            aria-label={`${name(item.platformId)}发布标题`}
                            value={item.title}
                            readOnly={draft.kind === 'layout'}
                            maxLength={1000}
                            onChange={(e) => setting(item.platformId, { title: e.target.value })}
                          />
                          <span className="small mono">
                            {Array.from(item.title).length} / {template?.titleMax ?? '待核验'}
                          </span>
                        </label>
                        {draft.kind !== 'layout' ? (
                          <label>
                            简介 / 正文
                            <textarea
                              aria-label={`${name(item.platformId)}发布文案`}
                              rows={3}
                              maxLength={100000}
                              value={item.description}
                              onChange={(e) => setting(item.platformId, { description: e.target.value })}
                            />
                            <span className="small mono">
                              {Array.from(item.description).length} / {template?.descriptionMax ?? '待核验'}
                            </span>
                          </label>
                        ) : (
                          <p className="small">正文与图片来自确认快照，需要改内容请退回排版中心。</p>
                        )}
                        <label>
                          话题标签
                          <input
                            aria-label={`${name(item.platformId)}话题标签`}
                            value={item.tags.join(' ')}
                            onChange={(e) => setting(item.platformId, { tags: e.target.value.split(' ') })}
                            onBlur={() => {
                              const tags = item.tags.map((t) => t.trim()).filter(Boolean);
                              if (JSON.stringify(tags) !== JSON.stringify(item.tags))
                                setting(item.platformId, { tags });
                            }}
                          />
                          <span className="small">
                            平台格式：{formatPublishTags(item.tags, item.platformId, config) || '--'}
                          </span>
                        </label>
                        <div className="publish-schedule">
                          <label>
                            发布时间
                            <select
                              aria-label={`${name(item.platformId)}发布方式`}
                              value={item.scheduleAt === null ? 'now' : 'scheduled'}
                              onChange={(e) =>
                                setting(item.platformId, { scheduleAt: e.target.value === 'now' ? null : '' })
                              }
                            >
                              <option value="now">确认后立即发布</option>
                              <option value="scheduled">指定时间</option>
                            </select>
                          </label>
                          {item.scheduleAt !== null && (
                            <label>
                              北京时间
                              <input
                                type="datetime-local"
                                aria-label={`${name(item.platformId)}定时时间`}
                                value={item.scheduleAt}
                                onChange={(e) => setting(item.platformId, { scheduleAt: e.target.value })}
                              />
                            </label>
                          )}
                        </div>
                        <p className="small">
                          {defaultPublishTime(item.platformId, data, config, now)
                            ? '已按本月推荐或模板时间生成，可单独调整。'
                            : '暂无有效推荐或模板时间；默认人工确认后立即发布。'}
                        </p>
                        {!template && <Button onClick={() => toggle(item.platformId)}>移除此发布目标</Button>}
                      </fieldset>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </section>
        <aside className="publish-check">
          <Card index="05" title="发布前检查" meta={<span className="eyebrow">CHECKLIST</span>}>
            <div className="publish-check-summary">
              <strong className="mono">{String(draft.settings.length).padStart(2, '0')}</strong>
              <span>个目标平台</span>
            </div>
            <div className="publish-check-list">
              {issues.length ? (
                issues.map((issue, i) => <p key={`${i}-${issue}`}>{issue}</p>)
              ) : (
                <p>内容检查通过，仍需人工核对并确认。</p>
              )}
            </div>
            <p className="small publish-card-note">
              {!data.uploadReady
                ? '平台上传服务未接入；不会上传或点击发布。'
                : !saved
                  ? '先保存准备内容，再上传到平台。'
                  : '上传后逐个平台查看截图，再确认发布。'}
            </p>
            <Button className="publish-review-button" disabled={!canUpload} onClick={() => void action('upload')}>
              上传到各平台
            </Button>
            <p className="small publish-card-note">上传只填好后台并停在发布前；支持草稿的平台优先存草稿。</p>
          </Card>
          <Card index="06" title="已保存批次" meta={<span className="eyebrow">{data.batches.length} ITEMS</span>}>
            {data.batches.length ? (
              <div className="publish-batches">
                {data.batches.map((batch) => (
                  <button key={batch.id} disabled={busy} onClick={() => protect(() => loadBatch(batch))}>
                    <strong>
                      {data.contents.find((c) => c.id === batch.draft.contentId)?.title ?? '关联作品不可用'}
                    </strong>
                    <span className="small">
                      {batchNames[batch.state]} · {batch.draft.settings.map((s) => name(s.platformId)).join(' / ')}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty>暂无保存的发布批次</Empty>
            )}
          </Card>
        </aside>
      </div>
      <Card
        index="07"
        title="截图审核与发布回执"
        meta={<span className="eyebrow">{meta ? 'CURRENT BATCH' : 'SELECT A BATCH'}</span>}
      >
        <div className="publish-review-heading">
          <p className="small">逐个平台查看填好后的真实截图。上传完成满 {expiryHours} 小时未发布，须重新上传。</p>
          <Button
            disabled={!canPublish}
            onClick={() => {
              setNow(Date.now());
              setReview({ draft: structuredClone(draft), requestId: crypto.randomUUID(), materials, receiptKey });
              setChecked(false);
            }}
          >
            全部发布（{readyReceipts.length}）
          </Button>
        </div>
        {meta && data.receipts.some((r) => r.batchId === meta.id) ? (
          <div className="publish-review-grid">
            {data.receipts
              .filter((r) => r.batchId === meta.id)
              .map((receipt) => {
                const status = receiptStatus(receipt, draft, data, config, now, expiryHours);
                const retryReady = canRetryPublishReceipt(receipt, draft, data, config, now, expiryHours, platforms);
                return (
                  <section key={receipt.id} className="publish-screenshot-card">
                    <div>
                      <strong>{name(receipt.platformId)}</strong>
                      <span>{statusNames[status]}</span>
                    </div>
                    {receipt.screenshotAssetId ? (
                      <a href={assetUrl(receipt.screenshotAssetId)} target="_blank" rel="noreferrer">
                        <img
                          key={`${receipt.screenshotAssetId}:${screenshotAttempt}`}
                          src={assetUrl(receipt.screenshotAssetId)}
                          alt={`${name(receipt.platformId)}填好后的后台截图`}
                          onLoad={() => screenshotLoaded(receipt.screenshotAssetId!)}
                          onError={() => screenshotFailed(receipt.screenshotAssetId!)}
                        />
                      </a>
                    ) : (
                      <Empty>{status === 'uploading' ? '上传中，等待后台截图' : '尚无后台截图'}</Empty>
                    )}
                    <p className="small">{receipt.title || '--'}</p>
                    <p className="small">
                      {status === 'expired' ? '上传已过期或材料已变化，请重新上传。' : (receipt.reason ?? '--')}
                    </p>
                    <p className="small mono">
                      上传完成：
                      {receipt.uploadedAt
                        ? new Date(receipt.uploadedAt).toLocaleString('zh-CN', {
                            timeZone: 'Asia/Shanghai',
                            hour12: false,
                          })
                        : '--'}
                    </p>
                    <p className="small">
                      平台作品 ID：{receipt.platformPostId ?? '--'} · {receipt.publishedAt ?? '尚未发布'}
                    </p>
                    {receipt.url && /^https?:\/\//.test(receipt.url) && (
                      <a href={receipt.url} target="_blank" rel="noreferrer">
                        查看作品 ↗
                      </a>
                    )}
                    <div className="publish-ai-actions">
                      <Button
                        disabled={!canUpload || !uploadTargets.includes(receipt.platformId)}
                        onClick={() => void action('upload', undefined, receipt.platformId)}
                      >
                        重新上传该平台
                      </Button>
                      <Button
                        disabled={
                          !data.publishReady ||
                          !retryReady ||
                          !receipt.screenshotAssetId ||
                          !loadedScreenshots.includes(receipt.screenshotAssetId) ||
                          busy ||
                          dirty ||
                          stale
                        }
                        onClick={() => {
                          retryRequest.current = crypto.randomUUID();
                          setRetry(receipt);
                        }}
                      >
                        重试该平台发布
                      </Button>
                    </div>
                  </section>
                );
              })}
          </div>
        ) : (
          <Empty>{meta ? '尚未上传到平台，暂无后台截图' : '保存并打开批次后，在这里核对平台截图'}</Empty>
        )}
      </Card>
      <footer className="layout-foot">
        <span>平台审核中不等于已发布；失败只处理对应平台。</span>
        <span>通用文案 → 平台版本 → 上传 → 截图审核 → 全部发布</span>
      </footer>
      {picker && (
        <Dialog title="选择自己上传的图片" onClose={() => setPicker(false)}>
          <div className="image-form">
            <input
              aria-label="搜索自制素材"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索素材名称"
            />
            <p className="small">
              已选 {draft.imageIds.length + local.length} / {config.xhsMaxImages} 张；按选择顺序排列，可在来源区调整。
            </p>
          </div>
          {data.assets.filter((a) => a.source === 'upload' && a.title.includes(search)).length ? (
            <div className="asset-picker">
              {data.assets
                .filter((a) => a.source === 'upload' && a.title.includes(search))
                .map((a) => (
                  <button
                    className="asset-tile"
                    key={a.id}
                    disabled={
                      draft.imageIds.includes(a.id) || draft.imageIds.length + local.length >= config.xhsMaxImages
                    }
                    onClick={() => change({ imageIds: [...draft.imageIds, a.id] })}
                  >
                    <AssetImage src={assetUrl(a.id)} alt={a.title} />
                    <strong>{a.title}</strong>
                    <span className="small">{draft.imageIds.includes(a.id) ? '已添加' : a.ratio}</span>
                  </button>
                ))}
            </div>
          ) : (
            <Empty>暂无符合条件的用户上传图片</Empty>
          )}
        </Dialog>
      )}
      {preview && (
        <Dialog title={`${name(preview.platform)} · 确认稿只读`} onClose={() => setPreview(null)}>
          <LayoutPreview
            variant={{
              ...preview.content,
              status: 'confirmed',
              revision: preview.layoutRevision,
              confirmedRevision: preview.layoutRevision,
            }}
            platform={preview.platform}
            assets={data.assets}
            config={layoutConfig}
          />
          <div className="publish-covers">
            {Object.entries(preview.content.covers).map(([ratio, id]) => (
              <div key={ratio}>
                <AssetImage src={assetUrl(id)} alt={`${ratio} 封面`} />
                <span className="small">{ratio} 封面</span>
              </div>
            ))}
          </div>
        </Dialog>
      )}
      {returning && (
        <Dialog title="退回排版中心" onClose={() => setReturning(null)}>
          <p>
            退回 {name(returning.platform)} 版本后，需要重新编辑、确认并送入发布中心。已发布或正在执行的内容不能退回。
          </p>
          {notice && <p role="status">{notice}</p>}
          <div className="layout-dialog-actions">
            <Button onClick={() => setReturning(null)}>取消</Button>
            <Button disabled={busy} onClick={() => void action('return', returning.id)}>
              确认退回
            </Button>
          </div>
        </Dialog>
      )}
      {review && (
        <Dialog
          title="确认发布所有已就绪平台"
          onClose={() => {
            if (!busy) setReview(null);
          }}
        >
          <p>本次只发布以下 {readyReceipts.length} 个已就绪平台；失败、过期、已发布和结果待核对的平台不会重复提交。</p>
          <div className="publish-review-grid">
            {readyReceipts.map((receipt) => (
              <section key={receipt.id} className="publish-screenshot-card">
                <strong>{name(receipt.platformId)}</strong>
                <img
                  src={assetUrl(receipt.screenshotAssetId!)}
                  alt={`${name(receipt.platformId)}待发布截图`}
                  onLoad={() => screenshotLoaded(receipt.screenshotAssetId!)}
                  onError={() => screenshotFailed(receipt.screenshotAssetId!)}
                />
                <p className="small">{receipt.title}</p>
                <p className="small mono">
                  {draft.settings.find((s) => s.platformId === receipt.platformId)?.scheduleAt ?? '确认后立即发布'}
                </p>
              </section>
            ))}
          </div>
          <p className="small">
            {materialChanged
              ? '材料、截图或就绪状态已变化，请关闭后重新核对。'
              : !data.publishReady
                ? '实际发布服务未接入。'
                : '请核对截图中的平台、内容、封面和时间。'}
          </p>
          <label className="publish-human-check">
            <input
              type="checkbox"
              checked={checked}
              disabled={!canPublish}
              onChange={(e) => setChecked(e.target.checked)}
            />
            我已检查以上截图，确认发布这些平台
          </label>
          {notice && <p role="status">{notice}</p>}
          <div className="layout-dialog-actions">
            <Button disabled={busy} onClick={() => setReview(null)}>
              返回审核
            </Button>
            <Button disabled={!canPublish || !checked} onClick={() => void action('publish-all')}>
              {busy ? '正在提交…' : '确认全部发布'}
            </Button>
          </div>
        </Dialog>
      )}
      {retry && (
        <Dialog title="确认重试这一个平台" onClose={() => setRetry(null)}>
          <p>
            {name(retry.platformId)} · {retry.title}
          </p>
          <p className="small">仅重试服务已核实未发布且截图仍有效的失败项，其他平台不重复提交。</p>
          {retry.screenshotAssetId && (
            <img
              className="publish-review-cover"
              src={assetUrl(retry.screenshotAssetId)}
              alt="失败平台的待发布截图"
              onError={() => screenshotFailed(retry.screenshotAssetId!)}
            />
          )}
          {notice && <p role="status">{notice}</p>}
          <div className="layout-dialog-actions">
            <Button onClick={() => setRetry(null)}>取消</Button>
            <Button disabled={busy || !data.publishReady || !retryAllowed} onClick={() => void retryReceipt()}>
              确认重试
            </Button>
          </div>
        </Dialog>
      )}
      {pending && (
        <Dialog title="有发布准备尚未保存" onClose={() => setPending(null)}>
          <p>继续会丢失本页填写内容和本机文件预览。是否放弃？</p>
          <div className="layout-dialog-actions">
            <Button onClick={() => setPending(null)}>继续编辑</Button>
            <Button
              onClick={() => {
                const run = pending;
                setPending(null);
                run();
              }}
            >
              放弃并继续
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
