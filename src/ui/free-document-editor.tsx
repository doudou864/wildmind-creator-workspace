'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { useEffect, useRef, useState } from 'react';
import type { Asset } from '@/lib/image-model';
import type { LayoutContent, LayoutConfig } from '@/lib/layout-model';
import { blocksFromDocument, documentFromBlocks, documentHTML, type RichNode } from '@/lib/rich-document';
import { Button } from './components';
import { request } from './use-resource';
const LibraryImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      assetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-asset-id'),
        renderHTML: (attrs) => ({ 'data-asset-id': attrs.assetId }),
      },
    };
  },
}).configure({
  resize: {
    enabled: true,
    directions: ['bottom-left', 'bottom-right'],
    alwaysPreserveAspectRatio: true,
    minWidth: 48,
    minHeight: 32,
  },
});
export function FreeDocumentEditor({
  value,
  onChange,
  disabled,
  assets,
  contentId,
  config,
  onUploaded,
}: {
  value: LayoutContent;
  onChange: (value: Partial<LayoutContent>) => void;
  disabled: boolean;
  assets: Asset[];
  contentId: string | null;
  config: LayoutConfig;
  onUploaded: () => void;
}) {
  const [library, setLibrary] = useState(false),
    [error, setError] = useState(''),
    [uploading, setUploading] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), LibraryImage],
    immediatelyRender: false,
    editable: !disabled,
    content: value.document ?? documentFromBlocks(value.blocks),
    editorProps: { attributes: { 'aria-label': '自由文档正文', class: 'free-document-body' } },
    onUpdate: ({ editor }) => {
      const document = editor.getJSON() as RichNode;
      change.current({ document, blocks: blocksFromDocument(document) });
    },
  });
  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);
  useEffect(() => {
    const next = value.document ?? documentFromBlocks(value.blocks);
    if (editor && JSON.stringify(editor.getJSON()) !== JSON.stringify(next))
      editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value.document, value.blocks]);
  function insert(id: string, title: string) {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: { assetId: id, src: `/api/images/assets/${encodeURIComponent(id)}/file`, alt: title },
      })
      .run();
    setLibrary(false);
  }
  async function upload(file: File) {
    if (!contentId) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('contentId', contentId);
      const result = await request<Asset>('/api/layouts/images', { method: 'POST', body: form });
      insert(result.id, result.title);
      onUploaded();
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }
  return (
    <section className="free-document">
      <div className="free-document-toolbar">
        <Button disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBold().run()}>
          加粗
        </Button>
        <Button
          disabled={disabled || !editor}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          小标题
        </Button>
        <Button disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          列表
        </Button>
        <Button disabled={disabled || !editor} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
          引用
        </Button>
        <Button disabled={disabled || !editor} onClick={() => editor?.chain().focus().undo().run()}>
          撤销
        </Button>
        <Button disabled={disabled || !editor} onClick={() => editor?.chain().focus().redo().run()}>
          重做
        </Button>
        <Button disabled={disabled} onClick={() => setLibrary(!library)}>
          插入素材
        </Button>
        <Button
          disabled={disabled || uploading || !contentId}
          disabledReason="请先关联作品，或等待当前操作完成"
          onClick={() => uploadInput.current?.click()}
        >
          上传图片
        </Button>
        <input
          ref={uploadInput}
          hidden
          aria-label="上传正文图片"
          type="file"
          accept="image/png,image/jpeg"
          disabled={disabled || uploading || !contentId}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = '';
          }}
        />
        <label>
          主题
          <select
            aria-label="排版主题"
            disabled={disabled}
            value={value.theme ?? 'none'}
            onChange={(e) => onChange({ theme: e.target.value as 'none' | 'editorial' })}
          >
            <option value="none">不加主题</option>
            <option value="editorial">{config.style.name}</option>
          </select>
        </label>
        <Button
          onClick={async () => {
            try {
              const html = documentHTML(value, config, location.origin);
              await navigator.clipboard.write([
                new ClipboardItem({
                  'text/html': new Blob([html], { type: 'text/html' }),
                  'text/plain': new Blob([value.title + '\n' + value.blocks.map((b) => b.text).join('\n')], {
                    type: 'text/plain',
                  }),
                }),
              ]);
              setError('已复制带样式正文；本机图片粘贴后需在公众号确认或重新上传。');
            } catch {
              setError('复制失败，请在预览里选取内容复制。');
            }
          }}
        >
          复制到公众号
        </Button>
      </div>
      {library && (
        <div className="free-image-library">
          {assets.map((a) => (
            <Button key={a.id} onClick={() => insert(a.id, a.title)}>
              {a.title}
            </Button>
          ))}
          {!assets.length && <p>暂无素材，可以直接上传图片。</p>}
        </div>
      )}
      <input
        className="free-document-title"
        aria-label="文档标题"
        placeholder="写标题"
        disabled={disabled}
        value={value.title}
        maxLength={200}
        onChange={(e) => onChange({ title: e.target.value })}
      />
      <EditorContent editor={editor} />
      {error && <p role="status">{error}</p>}
    </section>
  );
}
