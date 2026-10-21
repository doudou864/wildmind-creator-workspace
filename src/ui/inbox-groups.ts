import { waitingCount, type InboxMessage } from '../lib/inbox-model';

// UI grouping only: captured titles are a fallback label, never a persisted work association.
export function inboxGroupKey(item: InboxMessage) {
  return JSON.stringify([
    item.platformId,
    item.channel,
    item.channel === 'dm'
      ? ['dm']
      : item.platformPostId
        ? ['post', item.platformPostId]
        : item.contentId
          ? ['content', item.contentId]
          : item.contentTitle
            ? ['source-title', item.contentTitle]
            : ['unlinked'],
  ]);
}
export function groupInbox(items: InboxMessage[], allItems: InboxMessage[]) {
  const groups = new Map<
    string,
    { key: string; platformId: string; title: string; channel: string; items: InboxMessage[] }
  >();
  for (const item of items) {
    const key = inboxGroupKey(item);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        platformId: item.platformId,
        title:
          item.channel === 'dm'
            ? '私信'
            : !item.platformPostId && !item.contentId && !item.contentTitle
              ? '未关联作品的评论'
              : item.contentTitle || '作品标题未读取',
        channel: item.channel,
        items: [],
      };
      groups.set(key, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].map((group) => ({ ...group, waiting: waitingCount(group.items, allItems) }));
}
