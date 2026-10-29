import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { EgoBrowser } from './ego.ts';
import { CodexJudgment } from '../ai/structured.ts';
import { z } from 'zod';
import { CollectionSession } from './collection-session.ts';
import { loadBrowserConfig } from './config.ts';
import type { Judgment } from '../ai/structured.ts';
import type { LoginResult } from './interface.ts';
import { executionEvent } from '../jobs/execution-log.ts';
const visualState = z.object({
  state: z.enum(['logged_in', 'logged_out', 'verification', 'unknown']),
  evidence: z.string().min(1),
});
export async function visualLogin(
  platform: string,
  session: CollectionSession,
  judgment: Judgment,
  file: string,
  paths: string[],
  prior: LoginResult,
): Promise<LoginResult> {
  const cfg = (await loadBrowserConfig()).find((p) => p.id === platform)!;
  const url = await session.run<string>("console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.url()));");
  if (new URL(url).origin !== new URL(cfg.url).origin)
    return { ...prior, state: 'unknown', reason: '当前页面不在平台后台' };
  await session.capture(file);
  paths.push(file);
  const result = await judgment.read(
    visualState,
    `判定当前${platform}网页真实登录状态。只看此截图，不使用历史错误。显示明确后台账号身份和可用后台内容且无登录/验证遮挡才logged_in；登录入口为logged_out；真实验证码或安全验证为verification；加载中/不可辨认为unknown。evidence写具体可见证据。`,
    [file],
  );
  executionEvent('当前页面登录核验', 'success', JSON.stringify({ ...result, screenshot: file }));
  return {
    ...prior,
    state:
      result.state === 'verification'
        ? 'unknown'
        : result.state === 'logged_out' && cfg.confirmation
          ? 'awaiting_confirmation'
          : result.state,
    reason: result.state === 'verification' ? `需要处理：${result.evidence}` : result.evidence,
    checkedAt: new Date().toISOString(),
  };
}

// Observe ownership and the live page first; never reclaim a user-controlled tab.
export async function observeVisualLogin(platform: string, spaceId: number, page = 'p1') {
  const prior = await new EgoBrowser().observeLogin(platform, spaceId, page);
  if (prior.pageAvailability) return prior;
  const file = `data/captures/login/${platform}-${randomUUID()}.png`;
  const result = await visualLogin(
    platform,
    new CollectionSession(spaceId, page),
    new CodexJudgment(),
    file,
    [],
    prior,
  );
  await writeFile(file.replace(/\.png$/, '.json'), JSON.stringify(result), { mode: 0o600 });
  return result;
}
