import { z } from 'zod';
import type { LayoutBlock, LayoutContent, LayoutConfig } from './layout-model';
export type RichNode = {
  type: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null>;
  marks?: { type: string }[];
  content?: RichNode[];
};
export const richNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z
    .object({
      type: z.enum([
        'doc',
        'paragraph',
        'heading',
        'text',
        'hardBreak',
        'blockquote',
        'bulletList',
        'orderedList',
        'listItem',
        'image',
        'horizontalRule',
        'codeBlock',
      ]),
      text: z.string().max(100000).optional(),
      attrs: z
        .record(z.string(), z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]))
        .optional(),
      marks: z.array(z.object({ type: z.enum(['bold', 'italic', 'strike', 'code', 'underline']) }).strict()).optional(),
      content: z.array(richNodeSchema).max(2000).optional(),
    })
    .strict(),
);
const textNode = (text: string): RichNode[] =>
  text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .flatMap((part) =>
      part.startsWith('**') && part.endsWith('**')
        ? [{ type: 'text', text: part.slice(2, -2), marks: [{ type: 'bold' }] }]
        : part
            .split('\n')
            .flatMap((line, i) => [
              ...(i ? [{ type: 'hardBreak' }] : []),
              ...(line ? [{ type: 'text', text: line }] : []),
            ]),
    );
export function documentFromBlocks(blocks: LayoutBlock[]): RichNode {
  return {
    type: 'doc',
    content: blocks.flatMap((b): RichNode[] => {
      if (b.type === 'image')
        return [
          {
            type: 'image',
            attrs: {
              assetId: b.assetId,
              src: `/api/images/assets/${encodeURIComponent(b.assetId ?? '')}/file`,
              alt: b.text,
            },
          },
          ...(b.text ? [{ type: 'paragraph', content: textNode(b.text) }] : []),
        ];
      if (b.type === 'list')
        return [
          {
            type: 'bulletList',
            content: b.text
              .split('\n')
              .map((text) => ({ type: 'listItem', content: [{ type: 'paragraph', content: textNode(text) }] })),
          },
        ];
      const p: RichNode = { type: 'paragraph', content: textNode(b.text) };
      return [
        b.type === 'quote'
          ? { type: 'blockquote', content: [p] }
          : b.type === 'heading'
            ? { ...p, type: 'heading', attrs: { level: 2 } }
            : p,
      ];
    }),
  };
}
export function nodeText(node: RichNode): string {
  return node.type === 'text'
    ? (node.text ?? '')
    : node.type === 'hardBreak'
      ? '\n'
      : (node.content ?? [])
          .map(nodeText)
          .join(['bulletList', 'orderedList', 'blockquote'].includes(node.type) ? '\n' : '');
}
export function blocksFromDocument(doc: RichNode): LayoutBlock[] {
  const result: LayoutBlock[] = [];
  function visit(n: RichNode) {
    if (n.type === 'doc') {
      n.content?.forEach(visit);
      return;
    }
    result.push({
      id: `document-${result.length}`,
      type:
        n.type === 'image'
          ? 'image'
          : n.type === 'heading'
            ? 'heading'
            : n.type === 'blockquote'
              ? 'quote'
              : ['bulletList', 'orderedList'].includes(n.type)
                ? 'list'
                : 'paragraph',
      text: n.type === 'image' ? '' : nodeText(n),
      assetId: n.type === 'image' ? String(n.attrs?.assetId ?? '') : null,
    });
  }
  visit(doc);
  return result;
}
const escape = (s: unknown) =>
  String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export function documentHTML(v: LayoutContent, config?: LayoutConfig, origin = '') {
  const themed = v.theme === 'editorial' && config;
  function render(n: RichNode): string {
    if (n.type === 'text') {
      let text = escape(n.text);
      for (const m of n.marks ?? []) {
        const tag = (
          { bold: 'strong', italic: 'em', strike: 's', code: 'code', underline: 'u' } as Record<string, string>
        )[m.type];
        if (tag) text = `<${tag}>${text}</${tag}>`;
      }
      return text;
    }
    if (n.type === 'hardBreak') return '<br>';
    if (n.type === 'image') {
      const id = n.attrs?.assetId;
      if (!id) return '';
      const width = Number(n.attrs?.width);
      return `<img src="${escape(origin)}/api/images/assets/${encodeURIComponent(String(id))}/file" alt="${escape(n.attrs?.alt)}" style="max-width:100%;height:auto;${width > 0 ? `width:${Math.min(width, 4096)}px;` : ''}" />`;
    }
    const inner = (n.content ?? []).map(render).join('');
    const tag =
      (
        {
          doc: 'section',
          paragraph: 'p',
          heading: 'h2',
          blockquote: 'blockquote',
          bulletList: 'ul',
          orderedList: 'ol',
          listItem: 'li',
          codeBlock: 'pre',
          horizontalRule: 'hr',
        } as Record<string, string>
      )[n.type] ?? 'p';
    const style =
      themed && n.type === 'paragraph'
        ? ` style="font-size:${config.style.bodySize}px;line-height:${config.style.lineHeight};margin:0 0 ${config.style.paragraphGap}px"`
        : '';
    return `<${tag}${style}>${inner}</${tag}>`;
  }
  return `<article><h1>${escape(v.title)}</h1>${render(v.document ?? documentFromBlocks(v.blocks))}</article>`;
}
