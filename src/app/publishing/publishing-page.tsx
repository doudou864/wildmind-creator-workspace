'use client';
import { VideoPublishInputs } from '@/ui/video-publish-inputs';
import { mediaStage } from '@/lib/publishing-media-stage';
import Link from 'next/link';
import { uniqueVideoId } from '@/ui/work-flow';
import { ContentPicker } from '@/ui/content-picker';
import { AutosaveStatus } from '@/ui/autosave-status';
import type { SaveContext } from '@/ui/autosave-queue';
import { shouldSyncPublishingEditor } from '@/lib/publishing-editor-sync';
import { PublishingTasks } from '@/ui/publishing-tasks';
import { useAutosave } from '@/ui/use-autosave';
import { useEditSession } from '@/ui/use-edit-session';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Platform } from '@/lib/config';
import type { LayoutConfig } from '@/lib/layout-model';
import {
  publishMaterialKey,
  platformMaterialKey,
  videoDraftCovers,
  canRetryPublishReceipt,
  defaultPublishTime,
  generatePublishSetting,
  updateCommonCopy,
  restorePublishSetting,
  formatPublishTags,
  publishSettingIssues,
  videoUploadIssues,
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
import { PageHeader, Button, Card, Dialog, Empty } from '@/ui/components';
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
  managementPages = {},
}: {
  managementPages?: Record<string, string>;
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
  const { data, error, refresh } = useResource('/api/publishing', initialData);
  const initialBatch =
    !initialContent && initialKind === 'video'
      ? (data.batches
          .filter((b) => b.draft.kind === 'video' && b.draft.videoInput && !b.abandonedAt && b.state !== 'finished')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null)
      : null;
  const [draft, setDraft] = useState<PublishDraft>(() =>
    initialBatch
      ? structuredClone(initialBatch.draft)
      : {
          ...newPublishDraft(initialKind),
          contentId: initialContent,
          videoId: initialKind === 'video' ? uniqueVideoId(data.videos, initialContent) : null,
          ...(initialKind === 'video'
            ? {
                videoInput: {
                  topicId: data.contents.find((c) => c.id === initialContent)?.topicId ?? null,
                  path: '',
                  covers: data.contents.find((c) => c.id === initialContent)?.videoCovers ?? {},
                },
              }
            : {}),
          commonCopy: {
            title: data.contents.find((c) => c.id === initialContent)?.title ?? '',
            description: '',
            tags: [],
          },
        },
  );
  const [meta, setMeta] = useState<PublishBatch | null>(initialBatch);
  const savedRecord = useRef<string | null>(initialBatch?.id ?? null);
  const savedRevision = useRef<number | null>(initialBatch?.revision ?? null);
  const editSession = useRef(0);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [local, setLocal] = useState<LocalMedia[]>([]),
    [mediaLoading, setMediaLoading] = useState(false);
  const urls = useRef<string[]>([]),
    sequence = useRef(0);
  const [instruction, setInstruction] = useState('');
  const [history, setHistory] = useState<PublishBatch | null>(null);
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
  const publishRequest = useRef<{ key: string; id: string } | null>(null);
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
  const stage = mediaStage(liveBatch ?? meta, data.receipts);
  const taskLocked = !!data.tasks?.some((t) => t.batchId === meta?.id);
  const taskActionLocked = !!data.tasks?.some(
    (t) => t.batchId === meta?.id && !['ready', 'attention'].includes(t.status),
  );
  const locked =
    taskActionLocked ||
    !!liveBatch?.abandonedAt ||
    (!!meta && ['uploading', 'queued', 'running', 'finished'].includes(meta.state));
  const mediaLocked = taskLocked || locked || stage !== 'editable';
  const liveRetry = data.receipts.find((receipt) => receipt.id === retry?.id);
  const retryAllowed =
    !liveBatch?.abandonedAt &&
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
  const issues =
    draft.kind === 'video' && draft.videoInput
      ? videoUploadIssues(draft, data, config)
      : publishIssues(draft, data, config, platforms, now);
  const covers = videoDraftCovers(draft, data, config);
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
  const inputSession = editSession.current;
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
    if (liveBatch && shouldSyncPublishingEditor(meta, liveBatch, dirty)) {
      setMeta(liveBatch);
      savedRevision.current = liveBatch.revision;
      setDraft(structuredClone(liveBatch.draft));
    }
  }, [liveBatch, dirty, meta?.revision, meta?.state]);
  useEffect(() => {
    if (meta || dirty || !draft.contentId) return;
    const active = data.batches.find(
      (b) =>
        b.draft.contentId === draft.contentId &&
        b.draft.kind === draft.kind &&
        b.state !== 'finished' &&
        !b.abandonedAt,
    );
    if (active) {
      setMeta(active);
      setDraft(structuredClone(active.draft));
    }
  }, [data.batches, meta, dirty, draft.contentId, draft.kind]);
  const inFlight = data.receipts.some(
    (r) => r.batchId === meta?.id && ['queued', 'uploading', 'submitting'].includes(r.status),
  );
  useEffect(() => {
    if (!inFlight && !data.tasks?.some((t) => ['running', 'pausing', 'deleting'].includes(t.status))) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [inFlight, data.tasks, refresh]);
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
  function clearMedia() {
    sequence.current++;
    urls.current.forEach((url) => URL.revokeObjectURL(url));
    urls.current = [];
    setLocal([]);
    setMediaLoading(false);
  }
  async function protect(action: () => void) {
    if (busy) return;
    if (local.length || mediaLoading) {
      setNotice('正在保存素材，请稍候再切换。');
      return;
    }
    if (dirty && !(await autosave.flush())) {
      setNotice('当前内容尚未保存，请填写主题并检查保存提示后再切换。');
      return;
    }
    action();
  }
  function fresh(kind: PublishKind) {
    editSession.current++;
    clearMedia();
    setDraft({
      ...newPublishDraft(kind),
      ...(kind === 'video' ? { videoInput: { topicId: null, path: '', covers: {} } } : {}),
    });
    setMeta(null);
    savedRecord.current = null;
    savedRevision.current = null;
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
    if (taskLocked) return;
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
      setNotice(data.storageReady ? '正在自动上传保存文件…' : '素材存储服务未接入，文件仅在本页预览，尚未保存。');
    } catch {
      selected.forEach((item) => URL.revokeObjectURL(item.url));
      if (token === sequence.current) setNotice('图片无法读取，原有选择已保留。');
    } finally {
      if (token === sequence.current) setMediaLoading(false);
    }
  }
  async function upload() {
    if (!data.storageReady || !draft.contentId || !local.length || locked) return;
    const submittedSession = editSession.current;
    const uploadedSequence = sequence.current;
    try {
      const form = new FormData();
      form.set('metadata', JSON.stringify({ kind: draft.kind, contentId: draft.contentId }));
      local.forEach((item) => form.append('files', item.file));
      const result = await request<{ videoId: string | null; assetIds: string[] }>('/api/publishing/media', {
        method: 'POST',
        body: form,
      });
      if (submittedSession !== editSession.current) return;
      setDraft((d) =>
        d.contentId === draft.contentId
          ? { ...d, videoId: result.videoId ?? d.videoId, imageIds: [...d.imageIds, ...result.assetIds] }
          : d,
      );
      if (sequence.current === uploadedSequence) clearMedia();
      await refresh();
      setDirty(true);
      setNotice('文件已保存，内容会自动保存。');
    } catch (e) {
      throw e;
    }
  }
  async function save({ isCurrent }: SaveContext) {
    if (!data.storageReady || locked || local.length) return;
    if (!publishDraftSchema.safeParse(draft).success) {
      throw new Error('发布内容格式有误，请检查标题、话题标签和时间。');
    }
    const submittedSession = editSession.current;
    const recordId = meta?.id ?? savedRecord.current;
    try {
      const result = await request<PublishBatch>(
        recordId ? `/api/publishing/drafts/${encodeURIComponent(recordId)}` : '/api/publishing/drafts',
        {
          method: recordId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(recordId ? { 'If-Match': String(savedRevision.current ?? meta?.revision) } : {}),
          },
          keepalive: true,
          body: JSON.stringify(draft),
        },
      );
      if (submittedSession !== editSession.current) return;
      savedRecord.current = result.id;
      savedRevision.current = result.revision;
      setMeta(result);
      setDraft((current) => ({ ...current, contentId: result.draft.contentId }));
      setDirty(!isCurrent());
      await refresh();
    } catch (e) {
      throw e;
    }
  }
  const autosave = useAutosave(
    JSON.stringify([editSession.current, draft]),
    dirty &&
      data.storageReady &&
      !busy &&
      !locked &&
      !local.length &&
      (!!draft.contentId || (draft.kind === 'video' && !!draft.commonCopy.title.trim())),
    save,
  );
  const mediaAutosave = useAutosave(
    JSON.stringify([local.map((item) => [item.file.name, item.file.size, item.file.lastModified]), draft.contentId]),
    !!local.length && data.storageReady && !!draft.contentId && !busy && !locked && !mediaLoading,
    upload,
  );
  async function writeWithAI() {
    if (!data.aiReady || busy || locked) return;
    setBusy(true);
    try {
      const result = await request<PublishDraft>('/api/publishing/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai',
          draft,
          instruction: instruction.trim() || '生成通用标题、简介和话题，保留已单独修改的平台版本。',
        }),
      });
      setDraft(publishDraftSchema.parse(result));
      setDirty(true);
      setNotice('文案已生成，正在自动保存。');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'AI 修改失败');
    } finally {
      setBusy(false);
    }
  }
  async function action(
    kind: 'upload' | 'upload-and-publish' | 'publish-all' | 'return',
    snapshotId?: string,
    onlyPlatform?: string,
  ) {
    if (!meta || busy || dirty || locked || stale) return;
    const time = Date.now();
    const ready = readyPublishReceipts(meta.id, draft, data, config, platforms, time, expiryHours);
    const approvalKey = JSON.stringify([meta.id, materials, receiptKey]);
    if (!publishRequest.current || publishRequest.current.key !== approvalKey)
      publishRequest.current = { key: approvalKey, id: crypto.randomUUID() };
    const approval = draft.kind === 'video' ? { requestId: publishRequest.current.id, materials, receiptKey } : review;
    if (
      kind === 'publish-all' &&
      (!canPublish ||
        !approval ||
        (draft.kind !== 'video' && !checked) ||
        JSON.stringify(
          ready.map((r) => ({
            id: r.id,
            revision: r.revision,
            screenshotAssetId: r.screenshotAssetId,
            uploadedAt: r.uploadedAt,
          })),
        ) !== approval.receiptKey)
    ) {
      setNow(time);
      return;
    }
    if ((kind === 'upload' || kind === 'upload-and-publish') && (!canUpload || issues.length || taskLocked)) return;
    if (kind === 'upload-and-publish' && (draft.kind !== 'video' || !data.publishReady)) return;
    if (kind === 'return' && !data.handoffReady) return;
    const targets = uploadPlatformIds(meta.id, draft, data, config, time, expiryHours).filter(
      (id) => !onlyPlatform || id === onlyPlatform,
    );
    if ((kind === 'upload' || kind === 'upload-and-publish') && !targets.length) return;
    const key = JSON.stringify({ kind, batch: meta.id, revision: meta.revision, materials, targets });
    if (!uploadRequest.current || uploadRequest.current.key !== key)
      uploadRequest.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setNotice(
      kind === 'upload' || kind === 'upload-and-publish'
        ? '正在检查视频和封面，检查通过后开始上传，请稍候。'
        : '正在受理发布，请稍候。',
    );
    try {
      const payload = {
        action: kind,
        ...(['upload', 'upload-and-publish', 'publish-all'].includes(kind) ? { expectedRevision: meta.revision } : {}),
        ...(kind === 'publish-all'
          ? {
              confirmed: true,
              requestId: approval!.requestId,
              materials: approval!.materials,
              receipts: ready.map((r) => ({ id: r.id, expectedRevision: r.revision })),
            }
          : kind === 'upload' || kind === 'upload-and-publish'
            ? {
                requestId: uploadRequest.current.id,
                platformIds: targets,
                materials,
                ...(kind === 'upload-and-publish' ? { confirmed: true } : {}),
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
        kind === 'upload-and-publish'
          ? '任务已受理，将依次上传并发布，请查看逐平台回执。'
          : kind === 'publish-all'
            ? '发布任务已受理，请以逐平台回执为准。'
            : kind === 'upload'
              ? '上传任务已受理；完成后请检查各平台截图，尚未发布。'
              : '确认稿已退回排版中心。',
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
    editSession.current++;
    savedRecord.current = batch.id;
    savedRevision.current = batch.revision;
    clearMedia();
    setDraft(structuredClone(batch.draft));
    setMeta(batch);
    setDirty(false);
    setInstruction('');
    setNotice('已载入最新发布状态。');
  }
  if (draft.kind === 'layout' && draft.contentId && !data.snapshots.some((s) => s.contentId === draft.contentId)) {
    return (
      <main className="workspace publishing-workspace">
        <WorkspaceHeader current="/publishing" date={today} syncWindow={syncWindow} />
        <section className="card no-confirmed-draft">
          <h1>这条作品还没有确认稿</h1>
          <Link className="button button-primary" href={`/layouts?content=${encodeURIComponent(draft.contentId)}`}>
            去排版确认 →
          </Link>
        </section>
      </main>
    );
  }
  return (
    <main className="workspace publishing-workspace">
      <AutosaveStatus statuses={[autosave, mediaAutosave]} />
      <WorkspaceHeader current="/publishing" date={today} syncWindow={syncWindow} />
      <PageHeader
        title="发布中心"
        summary={
          stage === 'uploaded'
            ? '上传完成，请检查下方平台截图，确认后点击发布'
            : stage === 'published'
              ? '已有提交回执，请查看各平台发布与审核状态'
              : stage === 'blocked'
                ? '先核实平台结果，再继续操作'
                : stage === 'abandoned'
                  ? '已放弃这次上传，请到平台清理草稿'
                  : draft.kind === 'video'
                    ? '填写内容并选平台，可先上传审核，也可直接发布'
                    : !draft.contentId
                      ? '先选一条作品'
                      : draft.kind === 'layout' && !snapshots.length
                        ? '先回排版确认稿件，再准备上传'
                        : issues.length
                          ? `还差 ${issues.length} 项就能上传`
                          : canUpload
                            ? '准备完成，可以上传'
                            : '查看当前发布进度，完成下一步确认'
        }
        onRefresh={() => {
          setLoadedScreenshots([]);
          setScreenshotAttempt((n) => n + 1);
          void refresh();
        }}
        refreshing={busy}
        action={
          draft.kind === 'video' ? (
            <>
              <Button
                disabled={!canUpload || taskLocked}
                disabledReason={
                  busy
                    ? '正在处理当前请求，请稍候。'
                    : issues.join('；') || (taskLocked ? '已有任务，请从下方任务列表继续。' : '请等待保存完成。')
                }
                onClick={() => void action('upload')}
              >
                {busy ? '处理中…' : '上传'}
              </Button>
              <Button
                variant="primary"
                disabled={
                  readyReceipts.length ? !canPublish || inFlight : !canUpload || taskLocked || !data.publishReady
                }
                disabledReason={issues.join('；') || (taskLocked ? '请先核对平台截图和任务状态。' : '请等待保存完成。')}
                onClick={() => void action(readyReceipts.length ? 'publish-all' : 'upload-and-publish')}
              >
                发布
              </Button>
            </>
          ) : (
            <Button
              variant="primary"
              disabled={!canUpload}
              disabledReason={issues.join('；') || '请等待保存完成，并核对发布状态。'}
              onClick={() => void action('upload')}
            >
              检查并上传
            </Button>
          )
        }
      />
      {!canUpload && draft.kind !== 'video' && (
        <p className="publish-upload-reason">
          {issues.length
            ? `还需完成：${issues.join('；')}`
            : !data.uploadReady
              ? '平台上传目前未启用，先准备材料。'
              : busy
                ? '正在处理，请稍候。'
                : '请等待保存完成，并核对发布状态。'}
        </p>
      )}
      {draft.kind !== 'video' && (
        <nav className="creation-steps" aria-label="发布准备步骤">
          <a href="#publish-source">选成片 / 确认稿 →</a>
          <a href="#publish-platforms">选平台 →</a>
          <a href={draft.kind === 'layout' ? '#publish-platforms' : '#publish-copy'}>
            {draft.kind === 'layout' ? '核对确认稿 →' : '写文案 →'}
          </a>
          <a href="#publish-check">检查并上传 →</a>
        </nav>
      )}
      <div className="publish-mode" role="group" aria-label="发布来源">
        {modes.map((mode, i) => (
          <Button
            key={mode.value}
            className={draft.kind === mode.value ? 'active' : ''}
            aria-pressed={draft.kind === mode.value}
            disabled={busy}
            disabledReason="正在处理，请稍候。"
            onClick={() => {
              if (mode.value !== draft.kind) protect(() => fresh(mode.value));
            }}
          >
            <strong>{mode.label}</strong>
          </Button>
        ))}
      </div>
      {stale && liveBatch && (
        <p className="topic-feedback" role="alert">
          发布状态已更新，请载入最新状态后继续上传或发布。
          <Button
            disabled={busy}
            disabledReason="正在处理，请稍候。"
            onClick={() => protect(() => loadBatch(liveBatch))}
          >
            载入最新发布状态
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
      <div className={`publish-grid ${draft.kind === 'video' ? 'publish-simple-grid' : ''}`}>
        <aside className="publish-source">
          <div id="publish-source" />
          {stage !== 'editable' && (
            <section className="card">
              <h2>
                {stage === 'published'
                  ? '已提交，去平台查看状态'
                  : stage === 'abandoned'
                    ? '已放弃这次上传'
                    : stage === 'uploaded'
                      ? '已上传，尚未发布'
                      : '先核实平台结果'}
              </h2>
              {stage === 'uploaded' && meta && (
                <>
                  <Button
                    disabled={busy || dirty}
                    disabledReason="请等待保存完成"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await request(`/api/publishing/drafts/${meta.id}/abandon`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ expectedRevision: meta.revision }),
                        });
                        await refresh();
                        setNotice('已放弃本次上传。请到平台删除草稿，原回执仍保留。');
                      } catch (e) {
                        setNotice(e instanceof Error ? e.message : '放弃失败');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    放弃这次上传
                  </Button>
                  <p>只改本地记录，保留回执；请到平台删除草稿。</p>
                </>
              )}
              {stage === 'published' && <p>已提交内容请在平台管理，本页保留回执。</p>}
              {stage === 'blocked' && (
                <p>
                  {taskLocked
                    ? '请查看任务中的待处理事项；新作品可点“新的一条”。'
                    : '进行中或结果未知，请先核对平台状态。'}
                </p>
              )}
              {draft.settings.map((item) =>
                managementPages[item.platformId] ? (
                  <a
                    className="button button-text"
                    key={item.platformId}
                    href={managementPages[item.platformId]}
                    target="_blank"
                    rel="noreferrer"
                  >
                    去{name(item.platformId)}管理 →
                  </a>
                ) : null,
              )}
            </section>
          )}
          {draft.kind === 'video' ? (
            <VideoPublishInputs
              key={editSession.current}
              draft={draft}
              data={data}
              config={config}
              disabled={busy || mediaLocked}
              onChange={(patch) => {
                if (editSession.current === inputSession) change(patch);
              }}
              onRefresh={refresh}
            />
          ) : (
            <Card title="选确认稿或图片">
              <div className="image-form">
                <ContentPicker
                  value={draft.contentId}
                  form="图文"
                  disabled={busy}
                  onChange={(id) =>
                    protect(() => {
                      clearMedia();
                      const existing = data.batches.find(
                        (b) =>
                          b.draft.contentId === id &&
                          b.draft.kind === draft.kind &&
                          b.state !== 'finished' &&
                          !b.abandonedAt,
                      );
                      if (existing) {
                        loadBatch(existing);
                        return;
                      }
                      editSession.current++;
                      setDraft({
                        ...newPublishDraft(draft.kind),
                        contentId: id,
                        videoId: draft.kind === 'video' ? uniqueVideoId(data.videos, id) : null,
                        commonCopy: {
                          title: data.contents.find((c) => c.id === id)?.title ?? '',
                          description: '',
                          tags: [],
                        },
                      });
                      setMeta(null);
                      savedRecord.current = null;
                      savedRevision.current = null;
                      setDirty(true);
                      setInstruction('');
                      void refresh();
                    })
                  }
                />
                {draft.kind === 'layout' && (
                  <>
                    {snapshots.length ? (
                      snapshots.map((s) => (
                        <div className="publish-snapshot" key={s.id}>
                          <strong>
                            {name(s.platform)} · {s.content.title}
                          </strong>
                          <span className="small">排版修订 {s.layoutUpdatedAt} · 已人工确认</span>
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
                              disabledReason={
                                !data.handoffReady
                                  ? '发布交接暂不可用。'
                                  : '请确认版本已加入当前草稿，等待保存完成并解除锁定。'
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
                    <label className="publish-upload">
                      选择本机图片
                      <input
                        aria-label="选择本机图文图片"
                        type="file"
                        accept={config.imageTypes.join(',')}
                        multiple
                        disabled={busy || mediaLocked || mediaLoading}
                        onChange={(e) => void chooseFiles(e)}
                      />
                      <span className="small">
                        PNG / JPEG · 每张 {config.imageMaxMB} MB · 工作台上限 {config.xhsMaxImages} 张
                      </span>
                    </label>
                    <Button
                      disabled={busy || mediaLocked}
                      disabledReason="当前内容已锁定或正在处理，请先解锁或等待操作完成。"
                      onClick={() => {
                        setSearch('');
                        setPicker(true);
                      }}
                    >
                      从已上传素材选择
                    </Button>
                    <p className="small">移除或替换只改变本次配图，素材库原图保留。</p>
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
                              <a className="button" href={assetUrl(id)} download>
                                下载图片
                              </a>
                              <Button
                                aria-label={`第${i + 1}张前移`}
                                disabled={i === 0 || busy || mediaLocked}
                                disabledReason="已在首位，或正在处理，暂不能前移。"
                                onClick={() => {
                                  const ids = [...draft.imageIds];
                                  [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                                  change({ imageIds: ids });
                                }}
                              >
                                ←
                              </Button>
                              <Button
                                disabled={busy || mediaLocked}
                                disabledReason="当前内容已锁定或正在处理，请先解锁或等待操作完成。"
                                onClick={() => change({ imageIds: draft.imageIds.filter((value) => value !== id) })}
                              >
                                移除本次配图
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
                            disabledReason="已在首位，或正在处理，暂不能前移。"
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
                            disabledReason="正在处理，请稍候。"
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
                {draft.kind !== 'layout' && <></>}
              </div>
            </Card>
          )}
        </aside>
        <section className="publish-settings">
          <div id="publish-platforms" />{' '}
          <Card title="选平台" meta={<span className="eyebrow">{draft.settings.length} 个已选</span>}>
            <div className="publish-platforms">
              {eligibleTemplates
                .filter((t) => draft.kind !== 'video' || platforms.find((p) => p.id === t.platformId)?.active)
                .map((template) => {
                  const p = platforms.find((p) => p.id === template.platformId)!;
                  const matches = snapshots.filter((s) => s.platform === p.id);
                  const disabled =
                    busy ||
                    taskLocked ||
                    locked ||
                    (draft.kind === 'video' && !data.uploadPlatforms?.includes(p.id)) ||
                    (draft.kind === 'layout' &&
                      matches.length !== 1 &&
                      !draft.settings.some((s) => s.platformId === p.id));
                  return (
                    <label
                      key={p.id}
                      title={
                        !p.active
                          ? '平台尚未启用，可先准备手动发布材料'
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
                      {p.name}
                      {!p.active ? (
                        <small>未启用</small>
                      ) : draft.kind === 'video' && !data.uploadPlatforms?.includes(p.id) ? (
                        <small>暂不可上传</small>
                      ) : null}
                    </label>
                  );
                })}
            </div>
          </Card>
          {draft.kind === 'xhs' && (
            <Card title="写文案">
              <div id="publish-copy" />
              <p className="copy-limits">
                {draft.settings
                  .map((s) => {
                    const t = config.templates.find((t) => t.platformId === s.platformId);
                    return `${name(s.platformId)}：标题 ${t?.titleMax ?? '待核验'} 字，正文 ${t?.descriptionMax ?? '待核验'} 字`;
                  })
                  .join(' · ') || '先选平台，显示对应字数限制'}
              </p>
              <fieldset className="image-form" disabled={locked || busy}>
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
                    disabled={!data.aiReady || locked || busy}
                    disabledReason={
                      !data.aiReady ? 'AI 写作暂不可用。' : locked ? '当前内容已锁定。' : '正在处理，请稍候。'
                    }
                    onClick={() => void writeWithAI()}
                  >
                    AI 帮我写
                  </Button>
                </div>
              </fieldset>
            </Card>
          )}
          {draft.kind === 'video' ? (
            <p className="small">
              {stage === 'uploaded'
                ? '请检查平台截图，确认后点击发布。'
                : taskLocked
                  ? '查看下方任务进度与平台截图。'
                  : data.uploadReady
                    ? '选好平台后，可上传或直接发布。'
                    : '暂不能上传到平台，填写内容会自动保存。'}
            </p>
          ) : !draft.settings.length ? (
            <div className="card collapsed-note">选择平台后显示对应文案版本</div>
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
                  id={`publish-setting-${item.platformId}`}
                  className={`publish-platform-card card ${problems.length ? 'publish-warning' : ''}`}
                >
                  <Button
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
                  </Button>
                  {open && (
                    <div className="publish-platform-body">
                      {problems.length > 0 && (
                        <ul className="publish-problems">
                          {problems.map((problem) => (
                            <li key={problem}>{problem}</li>
                          ))}
                        </ul>
                      )}
                      {draft.kind === 'video' && !covers.find((c) => c.ratio === template?.videoCoverRatio)?.asset && (
                        <Link
                          href={`/images?${new URLSearchParams(draft.contentId ? { content: draft.contentId } : {})}`}
                        >
                          去生图中心补 →
                        </Link>
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
                          disabledReason={!item.individuallyEdited ? '当前已跟随通用文案。' : '当前已锁定或正在处理。'}
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
                        ) : null}
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

                        {!template && <Button onClick={() => toggle(item.platformId)}>移除此发布目标</Button>}
                      </fieldset>
                    </div>
                  )}
                </section>
              );
            })
          )}
        </section>
        <aside className="publish-check" id="publish-check">
          {draft.kind !== 'video' && (
            <Card title="检查并上传">
              <div className="publish-check-list">
                {issues.length ? (
                  issues.map((issue, i) => {
                    const platform = draft.settings.find((s) =>
                      publishSettingIssues(draft, s, data, config, platforms, now).includes(issue),
                    );
                    const target = platform
                      ? `publish-setting-${platform.platformId}`
                      : issue === '请选择发布平台'
                        ? 'publish-platforms'
                        : 'publish-source';
                    return (
                      <a
                        className="list-row"
                        key={`${i}-${issue}`}
                        href={`#${target}`}
                        onClick={() => {
                          if (platform)
                            setExpanded((current) => ({
                              ...current,
                              [platform.platformId]: {
                                key: JSON.stringify(
                                  publishSettingIssues(draft, platform, data, config, platforms, now),
                                ),
                                open: true,
                              },
                            }));
                        }}
                      >
                        {issue} →
                      </a>
                    );
                  })
                ) : (
                  <p>待补项已完成，可在页头检查并上传。</p>
                )}
              </div>
            </Card>
          )}
          {draft.kind === 'video' ? (
            <PublishingTasks
              data={data}
              platformNames={Object.fromEntries(platforms.map((p) => [p.id, p.name]))}
              receiptStates={Object.fromEntries(
                data.receipts.map((r) => [
                  r.id,
                  receiptStatus(
                    r,
                    data.batches.find((b) => b.id === r.batchId)?.draft ?? draft,
                    data,
                    config,
                    now,
                    expiryHours,
                  ),
                ]),
              )}
              selectedId={meta?.id ?? null}
              onNew={() => void protect(() => fresh('video'))}
              onSelect={(batch) => {
                if (batch.id !== savedRecord.current) void protect(() => loadBatch(batch));
              }}
              onRefresh={refresh}
              onDeleted={(id) => {
                if (meta?.id === id) fresh('video');
              }}
            />
          ) : data.batches.length ? (
            <Card
              title="最近的发布记录"
              meta={
                <Button disabled={busy} onClick={() => void protect(() => fresh(draft.kind))}>
                  新的一条
                </Button>
              }
            >
              {data.batches.length ? (
                <div className="publish-batches">
                  {data.batches.map((batch) => (
                    <Button
                      key={batch.id}
                      disabled={busy}
                      disabledReason="正在处理，请稍候。"
                      onClick={() => setHistory(batch)}
                    >
                      <strong>
                        {batch.draft.commonCopy.title ||
                          data.contents.find((c) => c.id === batch.draft.contentId)?.title ||
                          '未填写主题'}
                      </strong>
                      <span className="small">
                        {batch.abandonedAt ? '已放弃（回执保留）' : batchNames[batch.state]} ·{' '}
                        {batch.draft.settings.map((s) => name(s.platformId)).join(' / ')}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <Empty>暂无发布记录</Empty>
              )}
            </Card>
          ) : (
            <div className="card collapsed-note">暂无发布记录，保存发布准备后显示</div>
          )}
        </aside>
      </div>
      {meta && data.receipts.some((r) => r.batchId === meta.id) ? (
        <Card title="截图审核与发布回执">
          {draft.kind !== 'video' && (
            <div className="publish-review-heading">
              <Button
                disabled={!canPublish}
                disabledReason={
                  !data.publishReady ? '实际发布尚不可用。' : '请先上传并查看有效截图，等待保存完成，核对发布状态。'
                }
                onClick={() => {
                  setNow(Date.now());
                  setReview({ draft: structuredClone(draft), requestId: crypto.randomUUID(), materials, receiptKey });
                  setChecked(false);
                }}
              >
                全部发布（{readyReceipts.length}）
              </Button>
            </div>
          )}
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
                        平台作品 ID：{receipt.platformPostId ?? '--'} ·{' '}
                        {receipt.publishedAt ?? (receipt.status === 'pending_review' ? '等待平台审核' : '暂无发布时间')}
                      </p>
                      {receipt.url && /^https?:\/\//.test(receipt.url) && (
                        <a href={receipt.url} target="_blank" rel="noreferrer">
                          查看作品 →
                        </a>
                      )}
                      <div className="publish-ai-actions">
                        <Button
                          disabled={!canUpload || !uploadTargets.includes(receipt.platformId)}
                          disabledReason={
                            !data.uploadReady
                              ? '平台上传尚不可用。'
                              : '请核对材料与平台状态，仅可重新上传允许重传的目标。'
                          }
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
                          disabledReason={
                            !data.publishReady
                              ? '实际发布尚不可用。'
                              : '仅能重试已核实未发布且截图有效的失败项，请等待保存完成。'
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
            <Empty>{meta ? '尚未上传到平台，暂无后台截图' : '上传完成后，在这里核对平台截图'}</Empty>
          )}
        </Card>
      ) : (
        <div className="card collapsed-note">尚未上传，上传后在这里核对平台截图与回执</div>
      )}

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
                  <Button
                    className="asset-tile"
                    key={a.id}
                    disabled={
                      draft.imageIds.includes(a.id) || draft.imageIds.length + local.length >= config.xhsMaxImages
                    }
                    disabledReason="此图已添加，或已达到图片数量上限。"
                    onClick={() => change({ imageIds: [...draft.imageIds, a.id] })}
                  >
                    <AssetImage src={assetUrl(a.id)} alt={a.title} />
                    <strong>{a.title}</strong>
                    <span className="small">{draft.imageIds.includes(a.id) ? '已添加' : a.ratio}</span>
                  </Button>
                ))}
            </div>
          ) : (
            <Empty>暂无符合条件的用户上传图片</Empty>
          )}
        </Dialog>
      )}
      {history && (
        <Dialog title="发布记录 · 只读" onClose={() => setHistory(null)}>
          <p>
            {history.abandonedAt ? '已放弃（回执保留）' : batchNames[history.state]} · {history.createdAt}
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void protect(() => loadBatch(history));
              setHistory(null);
            }}
          >
            继续这条发布
          </Button>
          {history.draft.settings.map((item) => (
            <section key={item.platformId}>
              <strong>
                {name(item.platformId)} · {item.title}
              </strong>
              <p>{item.description}</p>
              <p>{item.scheduleAt ?? '立即发布'}</p>
              {data.receipts
                .filter((r) => r.batchId === history.id && r.platformId === item.platformId)
                .map((r) => (
                  <p key={r.id}>
                    {statusNames[r.status]} · {r.reason ?? ''}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer">
                        查看作品
                      </a>
                    )}
                  </p>
                ))}
            </section>
          ))}
        </Dialog>
      )}
      {preview && (
        <Dialog title={`${name(preview.platform)} · 确认稿只读`} onClose={() => setPreview(null)}>
          <LayoutPreview
            variant={{
              ...preview.content,
              status: 'sent',
              updatedAt: preview.layoutUpdatedAt,
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
            <Button
              disabled={busy}
              disabledReason="正在处理，请稍候。"
              onClick={() => void action('return', returning.id)}
            >
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
                ? '实际发布暂不可用，请保留当前准备。'
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
            <Button disabled={busy} disabledReason="正在处理，请稍候。" onClick={() => setReview(null)}>
              返回审核
            </Button>
            <Button
              disabled={!canPublish || !checked}
              disabledReason={
                !data.publishReady ? '实际发布尚不可用。' : '请核对有效截图并勾选人工确认，等待保存完成。'
              }
              onClick={() => void action('publish-all')}
            >
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
            <Button
              disabled={busy || !data.publishReady || !retryAllowed}
              disabledReason={
                !data.publishReady ? '实际发布尚不可用。' : '仅能重试已核实未发布且截图有效的失败项，请等待保存完成。'
              }
              onClick={() => void retryReceipt()}
            >
              确认重试
            </Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
