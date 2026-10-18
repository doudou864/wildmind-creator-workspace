import { eq } from 'drizzle-orm';
import { attentionItems } from '../db/schema.ts';
import { EgoBrowser } from '../browser/ego.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
import { pendingAttention, expireConfirmations } from './attention.ts';
import { startCrawl, finishCrawl } from './crawl-log.ts';
// Called by the scheduler: one bounded check, no long-running browser-side waits.
export async function checkConfirmations(
  database: WorkspaceDatabase,
  onReady: (platformId: string, spaceId: number, page: string) => Promise<void>,
  browser = new EgoBrowser(),
  now = new Date().toISOString(),
) {
  for (const item of expireConfirmations(database, now)) {
    const id = startCrawl(database, item.platformId, now);
    await finishCrawl(database, id, { status: 'failed', reason: '未确认登录' }, now);
  }
  for (const item of pendingAttention(database).filter((x) => x.kind === 'confirmation')) {
    if (!item.spaceId || !item.page) throw new Error('微信确认任务缺少浏览器位置');
    const result = await browser.observeLogin(item.platformId, item.spaceId, item.page);
    if (result.state === 'logged_in') {
      // Confirmation succeeded even if later data collection fails. Never expire it as an unconfirmed login.
      database.db
        .update(attentionItems)
        .set({ status: 'resolved', updatedAt: now })
        .where(eq(attentionItems.id, item.id))
        .run();
      await onReady(item.platformId, item.spaceId, item.page);
    }
  }
}
