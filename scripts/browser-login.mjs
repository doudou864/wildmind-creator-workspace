import { createInterface } from 'node:readline/promises';
import { EgoBrowser } from '../src/browser/ego.ts';
import { openDatabase } from '../src/db/database.ts';
import { accounts } from '../src/db/schema.ts';
const platformId = process.argv[2];
if (!platformId) throw new Error('用法：npm run browser:login -- douyin');
const browser = new EgoBrowser();
const opened = await browser.openLogin(platformId);
let result = opened.result;
if (!result) {
  console.log('已打开后台并交给你操作。请扫码或按后台提示登录。');
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  await terminal.question('确认后台已显示你的账号后，按回车检查并保存登录态：');
  terminal.close();
  result = await browser.finishLogin(platformId, opened.spaceId, opened.page);
}
const database = openDatabase();
try {
  database.db
    .insert(accounts)
    .values({
      platformId,
      loginState: result.state,
      checkedAt: result.checkedAt,
      reason: result.reason,
      statePath: result.statePath,
      updatedAt: result.checkedAt,
    })
    .onConflictDoUpdate({
      target: accounts.platformId,
      set: {
        loginState: result.state,
        checkedAt: result.checkedAt,
        reason: result.reason,
        statePath: result.statePath,
        updatedAt: result.checkedAt,
      },
    })
    .run();
} finally {
  database.sqlite.close();
}
console.log(
  `${platformId}：${result.state === 'logged_in' ? '已登录' : result.state === 'logged_out' ? '未登录' : '待核对'}。${result.reason}`,
);
