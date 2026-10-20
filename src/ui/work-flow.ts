import type { LayoutDocument } from '../lib/layout-model';
// Autoselection must never silently choose between multiple cuts of the same work.
export function uniqueVideoId(videos: { id: string; contentId: string }[], contentId: string | null) {
  const matches = contentId ? videos.filter((v) => v.contentId === contentId) : [];
  return matches.length === 1 ? matches[0].id : null;
}
export function resumableLayout(documents: LayoutDocument[], contentId: string | null) {
  return (
    documents
      .filter(
        (d) => (!contentId || d.contentId === contentId) && Object.values(d.variants).some((v) => v.status === 'draft'),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null
  );
}
