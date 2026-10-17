import { EgoBrowser } from '../src/browser/ego.ts';
import { openDatabase } from '../src/db/database.ts';
import { accounts } from '../src/db/schema.ts';
const browser = new EgoBrowser();
const ids = process.argv.slice(2);
const results = await browser.checkLogins(ids.length ? ids : undefined);
const database = openDatabase();
try {
  for (const result of results) {
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
      `${result.platformId}：${result.state === 'logged_in' ? '已登录' : result.state === 'logged_out' ? '未登录' : '待核对'}。${result.reason}`,
    );
  }
} finally {
  database.sqlite.close();
}
if (results.some((r) => r.state !== 'logged_in')) process.exitCode = 1;
