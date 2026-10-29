import { traceExecution } from '../jobs/execution-log.ts';
import { collectDouyinComments } from './douyin/comments.ts';
import { throwIfCollectionCancelled } from '../jobs/cancellation.ts';
import { collectDouyinDM } from './douyin/inbox.ts';
import { collectChannelsComments } from './channels/inbox.ts';
import { collectChannelsDM } from './channels/inbox-dm.ts';
import { collectYoutubeInbox } from './youtube/inbox.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
import type { Judgment } from '../ai/structured.ts';
import { type CollectionSession } from '../browser/collection-session.ts';
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
  let channel: 'comment' | 'dm' = 'comment';
  async function stage(kind: 'comment' | 'dm', run: () => Promise<unknown>) {
    channel = kind;
    await traceExecution(kind === 'comment' ? '评论读取' : '私信读取', run);
  }
  try {
    if (platformId === 'douyin') {
      await stage('comment', () => collectDouyinComments(db, session, judgment, paths));
      await stage('dm', () => collectDouyinDM(db, session, judgment, paths));
    } else if (platformId === 'channels') {
      await stage('comment', () => collectChannelsComments(db, session, judgment, paths));
      await stage('dm', () => collectChannelsDM(db, session, judgment, paths));
    } else if (platformId === 'bilibili') {
      await stage('comment', () => collectBilibiliInbox(db, session, judgment, paths));
      await stage('dm', () => collectBilibiliDM(db, session, judgment, paths));
    } else if (platformId === 'youtube') {
      await stage('comment', () => collectYoutubeInbox(db, session, judgment, paths));
    } else {
      await stage('comment', () => collectInbox(db, platformId, session, judgment, paths));
      if (platformId === 'xiaohongshu') await stage('dm', () => collectXiaohongshuDM(db, session, judgment, paths));
    }
  } catch (error) {
    throwIfCollectionCancelled();
    const reason = error instanceof Error ? error.message : '互动采集失败';
    inboxSource(db, { platformId, channel, status: 'failed', capturedAt: new Date().toISOString(), reason });
    throw error;
  }
}
