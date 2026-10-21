import { collectDouyinComments } from './douyin/comments.ts';
import { throwIfCollectionCancelled } from '../jobs/cancellation.ts';
import { collectDouyinDM } from './douyin/inbox.ts';
import { collectChannelsComments } from './channels/inbox.ts';
import { collectChannelsDM } from './channels/inbox-dm.ts';
import { collectYoutubeInbox } from './youtube/inbox.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
import type { Judgment } from '../ai/structured.ts';
import { AttentionRequired, type CollectionSession } from '../browser/collection-session.ts';
import { collectInbox } from './inbox.ts';
import { collectBilibiliInbox, collectBilibiliDM } from './bilibili/inbox.ts';
import { collectXiaohongshuDM } from './xiaohongshu/inbox.ts';
import { inboxSource } from '../lib/inbox-store.ts';
/** A failed inbox must stay visible without discarding a successful metric capture. */
export async function collectPlatformInbox(
  db: WorkspaceDatabase,
  platformId: string,
  session: CollectionSession,
  judgment: Judgment,
  paths: string[],
) {
  try {
    if (platformId === 'douyin') {
      await collectDouyinComments(db, session, judgment, paths);
      await collectDouyinDM(db, session, judgment, paths);
    } else if (platformId === 'channels') {
      await collectChannelsComments(db, session, judgment, paths);
      await collectChannelsDM(db, session, judgment, paths);
    } else if (platformId === 'bilibili') {
      await collectBilibiliInbox(db, session, judgment, paths);
      await collectBilibiliDM(db, session, judgment, paths);
    } else if (platformId === 'youtube') {
      await collectYoutubeInbox(db, session, judgment, paths);
    } else {
      await collectInbox(db, platformId, session, judgment, paths);
      if (platformId === 'xiaohongshu') await collectXiaohongshuDM(db, session, judgment, paths);
    }
  } catch (error) {
    throwIfCollectionCancelled();
    const reason = error instanceof Error ? error.message : '互动采集失败';
    for (const channel of ['comment', 'dm'] as const)
      inboxSource(db, { platformId, channel, status: 'failed', capturedAt: new Date().toISOString(), reason });
    if (error instanceof AttentionRequired || /控制权|浏览器操作超时|ego 操作失败/.test(reason)) throw error;
    console.error(`${platformId}互动：${reason}`);
  }
}
