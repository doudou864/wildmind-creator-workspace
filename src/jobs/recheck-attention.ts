import { observeVisualLogin } from '../browser/visual-login.ts';
import { eq } from 'drizzle-orm';
import { attentionItems } from '../db/schema.ts';
import type { WorkspaceDatabase } from '../db/database.ts';
import { EgoBrowser } from '../browser/ego.ts';
import { pendingAttention } from './attention.ts';
// Old login/risk evidence is a reason to inspect, not proof of the current page state.
// observeLogin refuses user-owned/closed spaces; unknown results never clear a blocker.
export async function recheckLoginAttention(
  database: WorkspaceDatabase,
  platformId: string,
  browser: Pick<EgoBrowser, 'observeLogin'> = { observeLogin: observeVisualLogin },
) {
  const recovered: { spaceId: number; page: string }[] = [];
  for (const item of pendingAttention(database).filter(
    (item) =>
      item.platformId === platformId &&
      (item.kind === 'login' || (item.kind === 'risk' && item.reason.startsWith('需要处理：'))),
  )) {
    if (!item.spaceId || !item.page) continue;
    const result = await browser.observeLogin(platformId, item.spaceId, item.page);
    if (result.state !== 'logged_in') continue;
    database.db
      .update(attentionItems)
      .set({ status: 'resolved', updatedAt: new Date().toISOString() })
      .where(eq(attentionItems.id, item.id))
      .run();
    recovered.push({ spaceId: item.spaceId, page: item.page });
  }
  return recovered;
}
