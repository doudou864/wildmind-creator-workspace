type Work = { id: string; updatedAt: string };
type Post = { id: string; contentId: string; publishedAt: string | null };

export function newestPosts<T extends Post>(posts: T[]): T[] {
  const time = (value: string | null) => Date.parse(value ?? '') || 0;
  return [...posts].sort((a, b) => time(b.publishedAt) - time(a.publishedAt));
}

export function defaultWork<T extends Work>(works: T[], posts: Post[]): T | undefined {
  const visibleIds = new Set(works.map((work) => work.id));
  const latest = newestPosts(posts).find((post) => visibleIds.has(post.contentId));
  return latest
    ? works.find((work) => work.id === latest.contentId)
    : [...works].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}
