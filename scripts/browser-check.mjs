import { EgoBrowser } from '../src/browser/ego.ts';
import { openDatabase } from '../src/db/database.ts';
import { accounts } from '../src/db/schema.ts';
import { requireAttention, notifyAttention, resolveAttention } from '../src/jobs/attention.ts';
import { loadBrowserConfig } from '../src/browser/config.ts';
import { confirmationDeadline } from '../src/browser/policy.ts';
const browser = new EgoBrowser(
  process.cwd(),
  undefined,
  process.env.WORKSPACE_EGO_SPACE ? Number(process.env.WORKSPACE_EGO_SPACE) : undefined,
);
const ids = process.argv.slice(2);
const results = await browser.checkLogins(ids.length ? ids : undefined);
const database = openDatabase();
try {
  for (const result of results) {
    if (result.state === 'awaiting_confirmation' && result.spaceId) {
      const config = (await loadBrowserConfig()).find((p) => p.id === result.platformId);
      await browser.requestConfirmation(result.platformId, result.spaceId, result.page);
      requireAttention(database, {
        platformId: result.platformId,
        kind: 'confirmation',
        reason: config.confirmation.message,
        deadline: confirmationDeadline(config.confirmation.deadline),
        spaceId: result.spaceId,
        page: result.page,
      });
    } else if (result.state === 'logged_in') resolveAttention(database, result.platformId);
    else requireAttention(database, { platformId: result.platformId, kind: 'login', reason: result.reason });
    const fields = {
      loginState: result.state,
      checkedAt: result.checkedAt,
      reason: result.reason,
      statePath: result.statePath,
      updatedAt: result.checkedAt,
    };
    database.db
      .insert(accounts)
      .values({ platformId: result.platformId, ...fields })
      .onConflictDoUpdate({ target: accounts.platformId, set: fields })
      .run();
    console.log(
      `${result.platformId}：${result.state === 'awaiting_confirmation' ? '需要微信确认' : result.state === 'logged_in' ? '已登录' : result.state === 'logged_out' ? '未登录' : '待核对'}。${result.reason}`,
    );
  }
  await notifyAttention(database);
} finally {
  database.sqlite.close();
}
if (results.some((r) => !['logged_in', 'awaiting_confirmation'].includes(r.state))) process.exitCode = 1;
