'use client';
import Link from 'next/link';
import { resumableLayout } from '@/ui/work-flow';
import { ContentPicker } from '@/ui/content-picker';
import { AutosaveStatus } from '@/ui/autosave-status';
import type { SaveContext } from '@/ui/autosave-queue';
import { useAutosave } from '@/ui/use-autosave';
import { useEditSession } from '@/ui/use-edit-session';
import { useRef, useState } from 'react';
import type { Asset } from '@/lib/image-model';
import {
  canSendLayout,
  createLayout,
  editLayout,
  fitsRatio,
  layoutIssues,
  layoutPayload,
  layoutSaveSchema,
  parseArticle,
  type LayoutAction,
  type LayoutBlock,
  type LayoutConfig,
  type LayoutContent,
  type LayoutData,
  type LayoutDocument,
  type LayoutPlatform,
} from '@/lib/layout-model';
import { PageHeader, Button, Card, Dialog, Empty, Segmented } from '@/ui/components';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { LayoutPreview } from '@/ui/layout-preview';
import { AssetImage } from '@/ui/asset-image';
import { request, useResource } from '@/ui/use-resource';
type Picker = { platform: LayoutPlatform; cover?: string; after?: string; replace?: string };
const blockNames = { paragraph: '正文', heading: '小标题', quote: '引用', list: '列表', image: '配图' };
export default function LayoutsPage({
  config,
  initialData,
  today,
  syncWindow,
  initialContent = null,
  initialTopic = null,
  initialLayout = null,
}: {
  initialContent?: string | null;
  initialTopic?: string | null;
  initialLayout?: string | null;
  config: LayoutConfig;
  initialData: LayoutData;
  today: string;
  syncWindow: string;
}) {
  const { data, error, refresh } = useResource('/api/layouts', initialData);
  const resumable = resumableLayout(data.documents, initialContent);
  const [source, setSource] = useState('');
  const [contentId, setContentId] = useState<string | null>(initialContent);
  const [document, setDocument] = useState<LayoutDocument | null>(
    () => data.documents.find((d) => d.id === initialLayout) ?? resumable ?? null,
  );
  const savedRecord = useRef<string | null>(null);
  const editSession = useRef(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [modes, setModes] = useState<Record<LayoutPlatform, 'edit' | 'preview'>>({
    wechat: 'edit',
    douyin: 'edit',
    x: 'edit',
  });
  const [instructions, setInstructions] = useState<Record<LayoutPlatform, string>>({ wechat: '', douyin: '', x: '' });
  const [picker, setPicker] = useState<Picker | null>(null);
  const [search, setSearch] = useState('');
  const [library, setLibrary] = useState(false);
  const [confirmation, setConfirmation] = useState<{ platform: LayoutPlatform; action: LayoutAction } | null>(null);
  useEditSession(
    `layouts:${initialLayout ?? initialContent ?? 'new'}`,
    { source, document, contentId, instructions },
    dirty,
    (saved) => {
      setSource(saved.source);
      setDocument(saved.document);
      setContentId(saved.contentId);
      setInstructions(saved.instructions);
      setDirty(true);
      setFeedback('已恢复本窗口排版编辑。');
    },
  );
  function reset() {
    editSession.current++;
    setContentId(document?.contentId ?? contentId);
    setSource('');
    savedRecord.current = null;
    setDocument(null);
    setDirty(false);
    setFeedback('');
    setInstructions({ wechat: '', douyin: '', x: '' });
  }
  function protect(action: () => void) {
    action();
  }
  function generate() {
    const draft = createLayout(source, contentId);
    const valid = layoutSaveSchema.safeParse(layoutPayload(draft));
    if (!valid.success || !draft.variants.wechat.title.trim() || !draft.variants.wechat.blocks.length) {
      setFeedback('请把标题放在第一行，正文从第二行开始；标题最多 200 字。');
      return;
    }
    editSession.current++;
    savedRecord.current = null;
    setDocument(draft);
    setDirty(true);
    setFeedback('已在本页建立三份独立稿件。抖音版保留完整原文，请自行精简。');
  }
  function edit(platform: LayoutPlatform, patch: Partial<LayoutContent>) {
    if (!document || busy) return;
    setDocument(editLayout(document, platform, { ...document.variants[platform], ...patch }));
    setDirty(true);
    setFeedback('');
  }
  function updateBlock(platform: LayoutPlatform, id: string, patch: Partial<LayoutBlock>) {
    if (document)
      edit(platform, { blocks: document.variants[platform].blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) });
  }
  function move(platform: LayoutPlatform, id: string, offset: number) {
    if (!document) return;
    const blocks = [...document.variants[platform].blocks];
    const from = blocks.findIndex((b) => b.id === id),
      to = from + offset;
    if (from < 0 || to < 0 || to >= blocks.length) return;
    [blocks[from], blocks[to]] = [blocks[to], blocks[from]];
    edit(platform, { blocks });
  }
  function choose(asset: Asset) {
    if (!document || !picker) return;
    const v = document.variants[picker.platform];
    if (picker.cover) edit(picker.platform, { covers: { ...v.covers, [picker.cover]: asset.id } });
    else if (picker.replace) updateBlock(picker.platform, picker.replace, { assetId: asset.id });
    else {
      const blocks = [...v.blocks];
      const after = picker.after ? blocks.findIndex((b) => b.id === picker.after) : blocks.length - 1;
      blocks.splice(after + 1, 0, { id: crypto.randomUUID(), type: 'image', text: '', assetId: asset.id });
      edit(picker.platform, { blocks });
    }
    setPicker(null);
  }
  async function save({ isCurrent }: SaveContext) {
    if (!document || !data.contents.some((c) => c.id === document.contentId && c.form === '图文') || !data.storageReady)
      return;
    setFeedback('');
    const submittedSession = editSession.current;
    const recordId = document.id ?? savedRecord.current;
    try {
      const payload = layoutPayload(document);
      layoutSaveSchema.parse(payload);
      const saved = await request<LayoutDocument>(
        recordId ? `/api/layouts/${encodeURIComponent(recordId)}` : '/api/layouts',
        {
          method: recordId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify(payload),
        },
      );
      if (submittedSession !== editSession.current) return;
      savedRecord.current = saved.id;
      setDocument((current) => (current ? { ...current, id: saved.id, updatedAt: saved.updatedAt } : current));
      setDirty(!isCurrent());
      await refresh();
    } catch (e) {
      throw e;
    }
  }
  const autosave = useAutosave(
    JSON.stringify([editSession.current, document && layoutPayload(document)]),
    dirty && !!document && data.storageReady && !busy,
    save,
  );
  async function act(platform: LayoutPlatform, action: LayoutAction) {
    if (!document?.id || dirty || busy) return;
    setBusy(true);
    setConfirmation(null);
    setFeedback('');
    try {
      const saved = await request<LayoutDocument>(`/api/layouts/${encodeURIComponent(document.id)}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          action,
          ...(action === 'ai' ? { instruction: instructions[platform] } : {}),
        }),
      });
      setDocument(saved);
      setDirty(false);
      setFeedback(
        action === 'confirm-send'
          ? '确认稿已送进发布中心，尚未发布。'
          : action === 'ai'
            ? '该版本已修改，请重新检查并确认。'
            : '该版本已退回，可继续修改。',
      );
      await refresh();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : '操作失败，当前稿件已保留。');
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  const linkedContent = data.contents.find((c) => c.id === (document?.contentId ?? contentId));
  const contentValid = linkedContent?.form === '图文';
  const documents = data.documents.filter((d) => !initialContent || d.contentId === initialContent);
  const ratio = picker?.cover ?? (picker?.platform === 'douyin' ? config.douyinImageRatio : null);
  const available = data.assets
    .filter((a) => (!ratio || fitsRatio(a, ratio)) && a.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(b.selected) - Number(a.selected) || b.version - a.version);
  return (
    <main className="workspace layouts-workspace">
      <AutosaveStatus statuses={[autosave]} />
      <WorkspaceHeader current="/layouts" date={today} syncWindow={syncWindow} />
      <PageHeader
        title="排版中心"
        summary={document ? '继续编辑稿件，检查配图和排版' : '新建文章，开始排版'}
        onRefresh={() => void refresh()}
        refreshing={busy}
        action={
          document ? (
            <Link
              className="button button-primary"
              href={`/publishing?content=${encodeURIComponent(document.contentId ?? contentId ?? '')}&kind=layout`}
            >
              准备发布 →
            </Link>
          ) : null
        }
      />
      {feedback && (
        <p className="topic-feedback" role="status">
          {feedback}
        </p>
      )}
      {error && (
        <p className="topic-feedback" role="alert">
          {error}
        </p>
      )}
      <Card
        title={document ? '当前稿件' : '粘贴文章'}
        meta={
          <div className="layout-resume-actions">
            <Button disabled={busy} disabledReason="正在处理稿件。" onClick={() => protect(reset)}>
              新建
            </Button>
            {!document && resumable && (
              <Button
                onClick={() => {
                  setDocument(structuredClone(resumable));
                  setContentId(resumable.contentId);
                  setSource(resumable.source);
                  savedRecord.current = resumable.id;
                  setDirty(false);
                }}
              >
                继续上次
              </Button>
            )}
            <Button disabled={busy} disabledReason="正在处理，请稍候。" onClick={() => setLibrary(true)}>
              稿件库 · {documents.length}
            </Button>
          </div>
        }
        className="layout-source"
      >
        <ContentPicker
          value={document?.contentId ?? contentId}
          topicId={initialTopic}
          form="图文"
          disabled={busy || !!document?.id}
          onChange={(id) => {
            setContentId(id);
            if (document) setDocument({ ...document, contentId: id });
            setDirty(true);
            void refresh();
          }}
        />
        {!document ? (
          <div className="layout-source-grid">
            <label>
              粘贴文章
              <textarea
                aria-label="文章原文"
                maxLength={100000}
                rows={5}
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setDirty(true);
                }}
                placeholder={'第一行填写标题\n\n正文用空行分段；支持 ## 小标题、> 引用、- 列表、**加粗**。'}
              />
            </label>
            <div className="layout-source-notes">
              <Button variant="primary" disabled={!source.trim()} disabledReason="请先粘贴文章。" onClick={generate}>
                开始排版 →
              </Button>
            </div>
          </div>
        ) : (
          <div className="layout-source-summary">
            <div>
              <strong>{parseArticle(document.source).title}</strong>
            </div>
            <details>
              <summary>查看原文</summary>
              <pre>{document.source}</pre>
            </details>
          </div>
        )}
      </Card>
      {document && (
        <div className="layout-columns">
          {config.platforms.map((platform, index) => {
            const v = document?.variants[platform.id];
            const locked = v?.status === 'sent';
            const issues = v ? layoutIssues(v, platform.id, data.assets, config) : [];
            const persisted = !!document?.id && !dirty;
            if (v && !contentValid) issues.push('请关联可用的图文作品');
            const canSend = !!v && canSendLayout(v) && persisted && data.handoffReady && !issues.length && !busy;
            return (
              <Card
                key={platform.id}
                title={platform.name}
                meta={<span className="layout-status">{!v ? '待排版' : locked ? '已送出 · 锁定' : '待确认'}</span>}
                className="layout-version"
              >
                <div className="layout-version-toolbar">
                  <span className="eyebrow">{platform.preview}</span>
                  <Segmented
                    label={`${platform.name}视图`}
                    value={modes[platform.id]}
                    options={[
                      { value: 'edit', label: '编辑' },
                      { value: 'preview', label: '预览' },
                    ]}
                    onChange={(mode) => setModes({ ...modes, [platform.id]: mode })}
                  />
                </div>
                {!v ? (
                  <div className="layout-empty">
                    <Empty>粘贴文章后，在这里编辑{platform.name}版本</Empty>
                  </div>
                ) : (
                  <>
                    {modes[platform.id] === 'preview' ? (
                      <LayoutPreview variant={v} platform={platform.id} assets={data.assets} config={config} />
                    ) : (
                      <fieldset className="layout-editor" disabled={locked || busy}>
                        <label className="layout-title-label">
                          标题
                          <input
                            aria-label={`${platform.name}标题`}
                            maxLength={200}
                            value={v.title}
                            onChange={(e) => edit(platform.id, { title: e.target.value })}
                          />
                        </label>
                        <div className="layout-blocks">
                          {v.blocks.map((block, i) => (
                            <div key={block.id} className="layout-block">
                              <div className="layout-block-head">
                                <span className="mono">{String(i + 1).padStart(2, '0')}</span>
                                {block.type === 'image' ? (
                                  <span>配图</span>
                                ) : (
                                  <select
                                    aria-label={`${platform.name}第${i + 1}块类型`}
                                    value={block.type}
                                    onChange={(e) =>
                                      updateBlock(platform.id, block.id, {
                                        type: e.target.value as LayoutBlock['type'],
                                      })
                                    }
                                  >
                                    {Object.entries(blockNames)
                                      .filter(([type]) => type !== 'image' && (platform.id !== 'x' || type !== 'quote'))
                                      .map(([type, name]) => (
                                        <option key={type} value={type}>
                                          {name}
                                        </option>
                                      ))}
                                  </select>
                                )}
                                <div>
                                  <Button
                                    aria-label={`${platform.name}第${i + 1}块上移`}
                                    disabled={i === 0}
                                    disabledReason="已在首位，或正在处理，暂不能前移。"
                                    onClick={() => move(platform.id, block.id, -1)}
                                  >
                                    ↑
                                  </Button>
                                  <Button
                                    aria-label={`${platform.name}第${i + 1}块下移`}
                                    disabled={i === v.blocks.length - 1}
                                    disabledReason="已在末位，不能下移。"
                                    onClick={() => move(platform.id, block.id, 1)}
                                  >
                                    ↓
                                  </Button>
                                  <Button
                                    aria-label={`${platform.name}删除第${i + 1}块`}
                                    onClick={() =>
                                      edit(platform.id, { blocks: v.blocks.filter((b) => b.id !== block.id) })
                                    }
                                  >
                                    移除
                                  </Button>
                                </div>
                              </div>
                              {block.type === 'image' ? (
                                <>
                                  <AssetImage
                                    className="layout-edit-image"
                                    src={`/api/images/assets/${encodeURIComponent(block.assetId ?? '')}/file`}
                                    alt={data.assets.find((a) => a.id === block.assetId)?.title ?? '未找到配图'}
                                  />
                                  <Button
                                    onClick={() => {
                                      setSearch('');
                                      setPicker({ platform: platform.id, replace: block.id });
                                    }}
                                  >
                                    替换配图
                                  </Button>
                                </>
                              ) : null}
                              <textarea
                                aria-label={`${platform.name}第${i + 1}块${block.type === 'image' ? '说明' : '内容'}`}
                                maxLength={100000}
                                rows={block.type === 'image' ? 1 : 3}
                                value={block.text}
                                placeholder={
                                  block.type === 'image'
                                    ? '图片说明（可选）'
                                    : block.type === 'list'
                                      ? '每行一项'
                                      : '输入内容'
                                }
                                onChange={(e) => updateBlock(platform.id, block.id, { text: e.target.value })}
                              />
                              {block.type !== 'image' && platform.id !== 'douyin' && (
                                <Button
                                  className="layout-insert"
                                  onClick={() => {
                                    setSearch('');
                                    setPicker({ platform: platform.id, after: block.id });
                                  }}
                                >
                                  在此段后配图
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="layout-add">
                          <Button
                            onClick={() =>
                              edit(platform.id, {
                                blocks: [
                                  ...v.blocks,
                                  { id: crypto.randomUUID(), type: 'paragraph', text: '', assetId: null },
                                ],
                              })
                            }
                          >
                            ＋ 段落
                          </Button>
                          <Button
                            disabled={
                              platform.id === 'douyin' &&
                              v.blocks.filter((b) => b.type === 'image').length >= config.douyinMaxImages
                            }
                            disabledReason="已达到此平台的配图数量上限。"
                            onClick={() => {
                              setSearch('');
                              setPicker({ platform: platform.id });
                            }}
                          >
                            ＋ 素材库配图
                          </Button>
                          <span className="small">
                            {v.blocks.filter((b) => b.type === 'image').length} 张
                            {platform.id === 'douyin' ? ` / 上限 ${config.douyinMaxImages}` : ''}
                          </span>
                        </div>
                      </fieldset>
                    )}
                    {platform.id === 'wechat' && (
                      <div className="layout-covers">
                        {config.wechatCoverRatios.map((r) => {
                          const asset = data.assets.find((a) => a.id === v.covers[r]);
                          return (
                            <div key={r}>
                              <span className="small">
                                {r} {r === config.wechatCoverRatios[0] ? '头图' : '转发卡片'}
                              </span>
                              {asset && (
                                <AssetImage
                                  src={`/api/images/assets/${encodeURIComponent(asset.id)}/file`}
                                  alt={asset.title}
                                />
                              )}
                              <Button
                                disabled={locked || busy}
                                disabledReason="当前内容已锁定或正在处理，请先解锁或等待操作完成。"
                                onClick={() => {
                                  setSearch('');
                                  setPicker({ platform: platform.id, cover: r });
                                }}
                              >
                                {asset ? '替换封面' : '选择封面'}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="layout-ai">
                      <label>
                        用自然语言修改这一版
                        <textarea
                          aria-label={`${platform.name}修改要求`}
                          rows={2}
                          maxLength={10000}
                          disabled={locked || busy}
                          value={instructions[platform.id]}
                          onChange={(e) => setInstructions({ ...instructions, [platform.id]: e.target.value })}
                          placeholder="例如：精简第二段，保留关键结论"
                        />
                      </label>
                      <Button
                        disabled={!data.aiReady || !persisted || !instructions[platform.id].trim() || locked || busy}
                        disabledReason={
                          !data.aiReady
                            ? 'AI 修改暂不可用。'
                            : locked
                              ? '请先退回修改。'
                              : !instructions[platform.id].trim()
                                ? '请填写修改要求。'
                                : '请等待稿件保存或当前操作完成。'
                        }
                        onClick={() => void act(platform.id, 'ai')}
                      >
                        应用修改
                      </Button>
                    </div>
                  </>
                )}
                <div className="layout-confirm">
                  <div className="small">{v && issues.length > 0 ? issues.join(' · ') : null}</div>
                  <div className="layout-confirm-buttons">
                    {v && (
                      <Button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              [
                                v.title,
                                ...v.blocks
                                  .filter((b) => b.type !== 'image')
                                  .map((b) =>
                                    b.type === 'heading'
                                      ? `## ${b.text}`
                                      : b.type === 'quote'
                                        ? `> ${b.text}`
                                        : b.type === 'list'
                                          ? b.text
                                              .split('\n')
                                              .map((line) => `- ${line}`)
                                              .join('\n')
                                          : b.text,
                                  ),
                              ].join('\n\n'),
                            );
                            setFeedback('已复制标题和正文；图片请从素材库下载后上传。');
                          } catch {
                            setFeedback('复制失败，请在预览中手动选取正文。');
                          }
                        }}
                      >
                        复制标题与正文
                      </Button>
                    )}

                    <Button
                      disabled={!canSend}
                      disabledReason={
                        !data.handoffReady
                          ? '发布交接暂不可用。'
                          : issues.length
                            ? issues.join('；')
                            : !v
                              ? '请先排版文章。'
                              : locked
                                ? '这一版已送出，请先退回修改。'
                                : '请等待稿件保存完成。'
                      }
                      onClick={() => setConfirmation({ platform: platform.id, action: 'confirm-send' })}
                    >
                      确认并送去发布
                    </Button>
                    {locked && document?.contentId && (
                      <Link
                        className="button"
                        href={`/publishing?content=${encodeURIComponent(document.contentId)}&kind=layout`}
                      >
                        查看发布准备 →
                      </Link>
                    )}
                    {locked && (
                      <Button
                        disabled={!persisted || !data.handoffReady || busy}
                        disabledReason={!data.handoffReady ? '发布交接暂不可用。' : '请等待稿件保存或当前操作完成。'}
                        onClick={() => setConfirmation({ platform: platform.id, action: 'revise' })}
                      >
                        退回修改
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <div className="page-tools">
        <Link
          href={`/images?${new URLSearchParams({ ...(document?.contentId ? { content: document.contentId } : contentId ? { content: contentId } : {}), ...(initialTopic ? { topic: initialTopic } : {}) })}`}
        >
          去生图中心准备配图 →
        </Link>
      </div>
      {picker && (
        <Dialog
          title={`选择${picker.cover ? `${picker.cover} 封面` : '配图'} · ${config.platforms.find((p) => p.id === picker.platform)?.name}`}
          onClose={() => setPicker(null)}
        >
          <div className="layout-picker-top">
            <input
              aria-label="搜索素材"
              placeholder="搜索素材名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="small">{ratio ? `仅显示 ${ratio} 素材` : '显示全部比例'} · 优先已选版本</span>
            <Link
              href={`/images?${new URLSearchParams({ ...(document?.contentId ? { content: document.contentId } : contentId ? { content: contentId } : {}), ...(initialTopic ? { topic: initialTopic } : {}) })}`}
              target="_blank"
              rel="noreferrer"
            >
              新窗口去生图中心 →
            </Link>
          </div>
          {available.length ? (
            <div className="asset-picker">
              {available.map((a) => (
                <Button key={a.id} className="asset-tile" onClick={() => choose(a)}>
                  <AssetImage src={`/api/images/assets/${encodeURIComponent(a.id)}/file`} alt={a.title} />
                  <strong>{a.title}</strong>
                  <span className="small">
                    {a.ratio} · V{a.version}
                    {a.selected ? ' · 已选版本' : ''}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty>没有符合条件的素材，请先在生图中心准备</Empty>
          )}
        </Dialog>
      )}
      {library && (
        <Dialog title="稿件库" onClose={() => setLibrary(false)}>
          {documents.length ? (
            <div className="image-drafts">
              {documents.map((d) => (
                <Button
                  key={d.id}
                  onClick={() => {
                    setLibrary(false);
                    protect(() => {
                      editSession.current++;
                      savedRecord.current = d.id;
                      setDocument(structuredClone(d));
                      setContentId(d.contentId);
                      setSource(d.source);
                      setDirty(false);
                      setInstructions({ wechat: '', douyin: '', x: '' });
                      setFeedback('已打开保存的稿件。');
                    });
                  }}
                >
                  <strong>{d.variants.wechat.title}</strong>
                  <span>
                    更新 {d.updatedAt} ·{' '}
                    {config.platforms
                      .map((p) => `${p.name}：${d.variants[p.id].status === 'sent' ? '已送出' : '待确认'}`)
                      .join(' / ')}
                  </span>
                </Button>
              ))}
            </div>
          ) : (
            <Empty>暂无已保存的排版稿</Empty>
          )}
        </Dialog>
      )}
      {confirmation && document && (
        <Dialog
          title={confirmation.action === 'confirm-send' ? '确认并送去发布' : '退回修改'}
          onClose={() => setConfirmation(null)}
        >
          <p>
            {confirmation.action === 'confirm-send'
              ? '将发送这一版的确认快照，其他版本不受影响。此操作不会直接发布。'
              : '服务将检查发布状态并撤回待发快照；已经发布或正在发布的内容不能直接退回。'}
          </p>
          <LayoutPreview
            variant={document.variants[confirmation.platform]}
            platform={confirmation.platform}
            assets={data.assets}
            config={config}
          />
          {confirmation.platform === 'wechat' && (
            <div className="layout-covers">
              {config.wechatCoverRatios.map((r) => {
                const asset = data.assets.find((a) => a.id === document.variants.wechat.covers[r]);
                return (
                  <div key={r}>
                    <span className="small">{r} 封面</span>
                    {asset ? (
                      <AssetImage src={`/api/images/assets/${encodeURIComponent(asset.id)}/file`} alt={asset.title} />
                    ) : (
                      <Empty>封面缺失</Empty>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="layout-dialog-actions">
            <Button onClick={() => setConfirmation(null)}>取消</Button>
            <Button onClick={() => void act(confirmation.platform, confirmation.action)}>确认继续</Button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
