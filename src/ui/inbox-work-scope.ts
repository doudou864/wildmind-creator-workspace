import type { InboxMessage } from '../lib/inbox-model';
import { isVisibleRecord } from './visible-records';

type Work = { id: string; title: string; mergedInto?: string | null };
type Post = { id: string; contentId: string; platformId: string; platformPostId: string | null };
export type InboxWorkScope =
  | {
      status: 'ready';
      contentId: string;
      title: string;
      posts: Omit<Post, 'contentId'>[];
      postId: string | null;
    }
  | { status: 'invalid'; message: string };

export function resolveInboxWorkScope(
  query: { content?: string; post?: string },
  works: Work[],
  posts: Post[],
): InboxWorkScope | null {
  if (!query.content && !query.post) return null;
  const requestedWork = query.content ? works.find((work) => work.id === query.content) : null;
  const work = requestedWork?.mergedInto ? works.find((item) => item.id === requestedWork.mergedInto) : requestedWork;
  const post = query.post ? posts.find((item) => item.id === query.post) : null;
  if (query.content && (!work || !isVisibleRecord(work)))
    return { status: 'invalid', message: '这条作品不存在或已归档，无法确定评论范围。' };
  if (query.post && !post) return { status: 'invalid', message: '这条平台作品记录不存在，无法确定评论范围。' };
  if (work && post && work.id !== post.contentId)
    return { status: 'invalid', message: '作品与平台记录不一致，请从作品数据重新打开评论。' };
  const selected = work ?? works.find((item) => item.id === post?.contentId);
  if (!selected || !isVisibleRecord(selected))
    return { status: 'invalid', message: '这条作品不存在或已归档，无法确定评论范围。' };
  return {
    status: 'ready',
    contentId: selected.id,
    title: selected.title,
    posts: posts
      .filter((item) => item.contentId === selected.id)
      .map(({ id, platformId, platformPostId }) => ({ id, platformId, platformPostId })),
    postId: post?.id ?? null,
  };
}

export function matchesInboxWorkScope(item: InboxMessage, scope: InboxWorkScope | null): boolean {
  if (!scope) return true;
  if (scope.status === 'invalid') return false;
  if (item.contentId && item.contentId !== scope.contentId) return false;
  const matchingPost = scope.posts.find(
    (post) =>
      (!scope.postId || post.id === scope.postId) &&
      !!post.platformPostId &&
      post.platformId === item.platformId &&
      post.platformPostId === item.platformPostId,
  );
  return scope.postId ? !!matchingPost : item.contentId === scope.contentId || !!matchingPost;
}
