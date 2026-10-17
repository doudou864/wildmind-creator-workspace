import { test, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeDatabase } from '../db/database';
import { loadConfig } from '../lib/config';
import { showData } from './data-show';
import { startCrawl, finishCrawl } from './crawl-log';
import { countAI, countPage, reusedScreenshots, telemetry } from './telemetry';
test('查看命令公开约数、补数和真实运行统计；旧日志不伪造零次', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'show-'));
  const db = await initializeDatabase(path.join(dir, 'workspace.db'));
  try {
    const now = new Date('2026-10-17T12:00:00Z');
    db.sqlite
      .prepare("INSERT INTO accounts(platform_id,login_state,updated_at) VALUES ('douyin','logged_in',?)")
      .run(now.toISOString());
    db.sqlite
      .prepare(
        "INSERT INTO account_daily(id,platform_id,data_date,metric_id,value,precision,raw_value,backfilled,captured_at,updated_at) VALUES ('a','douyin','2026-10-15','followers',30700,'display','3.07万',1,?,?)",
      )
      .run(now.toISOString(), now.toISOString());
    const id = startCrawl(db, 'douyin', '2026-10-17T11:59:00Z');
    countPage();
    countAI(true);
    countAI(false); // CSV作品的语义关联不能冒充截图识别
    reusedScreenshots();
    telemetry()!.attention = true;
    await finishCrawl(db, id, { status: 'failed', reason: '验证码' }, now.toISOString());
    const report = showData(db, await loadConfig(), 'douyin', now);
    expect(report).toContain('3.07万（约数/显示精度）');
    expect(report).toContain('补数据：是');
    expect(report).toContain('打开页面：1 | AI识别：1 | AI总调用：2 | 耗时：60秒');
    expect(report).toContain('需要处理：是');
    db.sqlite.prepare('UPDATE crawl_logs SET telemetry=NULL').run();
    expect(showData(db, await loadConfig(), 'douyin', now)).toContain('打开页面：未记录');
  } finally {
    db.sqlite.close();
    await rm(dir, { recursive: true, force: true });
  }
});
