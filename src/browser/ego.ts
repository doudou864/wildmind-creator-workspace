import { traceExecution, executionEvent, redactDiagnostic } from '../jobs/execution-log.ts';
import { collectionSignal, throwIfCollectionCancelled, CollectionCancelled } from '../jobs/cancellation.ts';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadBrowserPolicy, pause, randomBetween, consumePage } from './policy.ts';
import { loadConfig } from '../lib/config.ts';
import { detectLogin, loadBrowserConfig, type BrowserPlatform } from './config.ts';
import type { LoginResult, WorkspaceBrowser } from './interface.ts';

export class ScreenshotTimeout extends Error {}

export function egoFailure(output: string) {
  if (
    /EGO_.*(?:CONTROL|INACTIVE|UNASSIGNED)|control.*(?:lost|user)|no longer assigned|task has ended|控制权/i.test(
      output,
    )
  )
    return '控制权已交给用户；请在处理后恢复';
  if (/task space not found/i.test(output)) return '原浏览器工作区已关闭；请使用任务中的恢复入口';
  if (
    /ElementResolutionError|Invalid locator|Unsupported key|Unknown key|page.fill did not accept|视频号控件无法唯一识别|视频号控件不存在|视频号控件尚未可用/i.test(
      output,
    )
  )
    return (
      '页面控件操作失败：' +
      redactDiagnostic(
        output.split('\n').find((line) => /Error:|Invalid locator|Unsupported key|Unknown key/.test(line)) ??
          '控件未匹配',
      )
    );
  if (/net::ERR_(?:INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|CONNECTION_[A-Z_]+|NETWORK_CHANGED|TIMED_OUT)/.test(output))
    return '网络连接失败，等待配置的重试时段';
  if (/TimeoutError|timed out|timeout exceeded/i.test(output))
    return '页面等待超时，弹窗或页面元素未按时出现；等待配置的重试时段';
  return 'ego 操作失败或控制权已交给用户；请查看浏览器，不自动重试';
}

// The CLI owns the browser; no platform HTTP/API calls occur here.
export function runEgo(script: string): Promise<unknown> {
  throwIfCollectionCancelled();
  const operations = [
    ...new Set(
      script.match(
        /(?:page|task|t)\.(?:goto|click|evaluate|screenshot|waitFor\w+|handOff|finish|pages|cdp|close|snapshot|fill)\b/g,
      ) ?? [],
    ),
  ].join(', ');
  return traceExecution(
    `浏览器操作 ${operations || '工作区检查'}`,
    () =>
      new Promise((resolve, reject) => {
        const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '';
        const timeout = setTimeout(() => {
          child.kill();
          reject(new Error('浏览器操作超时；请查看 ego 窗口，未自动重试'));
        }, 90_000);
        const signal = collectionSignal();
        const abort = () => {
          child.kill();
          reject(new CollectionCancelled());
        };
        signal?.addEventListener('abort', abort, { once: true });
        child.once('close', () => signal?.removeEventListener('abort', abort));
        if (signal?.aborted) abort();
        child.stdout.on('data', (chunk) => {
          output += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
          output += chunk.toString();
        }); // ego prints console output on stderr; only parse our marker.
        child.on('error', () => {
          clearTimeout(timeout);
          reject(new Error('无法启动 ego-browser，请确认已安装并正在运行'));
        });
        child.on('close', (code) => {
          clearTimeout(timeout);
          if (code !== 0) {
            // Publishing workers do not have a collection log context; retain the actual cause in worker.log too.
            console.error('[browser-error]', redactDiagnostic(output));
            executionEvent(
              '浏览器底层错误',
              'failed',
              output
                .split('\n')
                .filter((line) => /Error|EGO_|net::|Timeout|at /.test(line))
                .join('\n') || '未返回错误详情',
            );
            reject(
              /CDP request timed out: Page\.captureScreenshot/.test(output)
                ? new ScreenshotTimeout('浏览器截图超时，未读到截图')
                : new Error(egoFailure(output)),
            );
            return;
          }
          const line = output.split('\n').findLast((line) => line.startsWith('WORKSPACE_RESULT:'));
          try {
            resolve(JSON.parse(line!.slice('WORKSPACE_RESULT:'.length)));
          } catch {
            reject(new Error('浏览器没有返回可核验结果'));
          }
        });
        child.stdin.end(script);
      }),
  );
}

// Pending login tabs are reserved until the user completes or the request expires.
export async function collectionPage(spaceId: number, reserved: string[], execute = runEgo): Promise<string> {
  return (await execute(
    `const t=await taskSpace(${spaceId});const reserved=${JSON.stringify(reserved)};const pages=await t.pages();const page=pages.find(p=>!reserved.includes(p.label))??await t.newPage();console.log('WORKSPACE_RESULT:'+JSON.stringify(page.label));`,
  )) as string;
}

// Only scoped cookies/localStorage are stored, with owner-only permissions. Never print them.
function stateScript(root: string, config: BrowserPlatform) {
  return `
const fs=await import('node:fs/promises');
const cfg=${JSON.stringify(config)};
const directory=${JSON.stringify(path.join(root, 'data/browser'))};
const filename=${JSON.stringify(path.join(root, 'data/browser', `${config.id}.json`))};
const scoped=(cookie)=>cfg.domains.some(d=>cookie.domain.replace(/^\\./,'')===d || cookie.domain.endsWith('.'+d));
async function saveState(page){
 const cookies=(await page.cdp('Network.getAllCookies')).cookies.filter(scoped);
 const storage=await page.evaluate(()=>({origin:location.origin,localStorage:Object.fromEntries(Object.entries(localStorage))}));
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 await fs.chmod(directory,0o700);
 const tmp=filename+'.tmp';
 await fs.writeFile(tmp,JSON.stringify({version:1,savedAt:new Date().toISOString(),cookies,...storage}),{mode:0o600});
 await fs.chmod(tmp,0o600);await fs.rename(tmp,filename);
}
async function navigate(page){
 try{await page.goto(cfg.url);}catch(e){if(!String(e).includes('navigation committed'))throw e;}
}
function verified(o){return new URL(o.url).origin===new URL(cfg.url).origin && cfg.loggedInPath && new URL(o.url).pathname.includes(cfg.loggedInPath) && cfg.loggedIn.length>0 && o.positive.length===cfg.loggedIn.length && !o.negative.length && !(o.risk?.length);}
async function observe(page){
 // Wait for the same evidence verified below, not just text in a partially loaded page.
 try{await page.waitForFunction((c)=>{const text=[document.body?.innerText??'',...Array.from(document.querySelectorAll('iframe')).map(f=>{try{return f.contentDocument?.body?.innerText??'';}catch{return '';}})].join(' ');return (location.origin===new URL(c.url).origin && !!c.loggedInPath && location.pathname.includes(c.loggedInPath) && c.loggedIn.length>0 && c.loggedIn.every(m=>text.includes(m)) && !c.loggedOut.some(m=>text.includes(m)) && !c.riskMarkers.some(m=>text.includes(m)));},cfg,{timeout:10000});}catch{}
 const observed=await page.evaluate(c=>{const text=[document.body.innerText,...Array.from(document.querySelectorAll('iframe')).map(f=>{try{return f.contentDocument?.body?.innerText??'';}catch{return '';}})].join(' ');return {url:location.href,positive:c.loggedIn.filter(m=>text.includes(m)),negative:c.loggedOut.filter(m=>text.includes(m)),risk:c.riskMarkers.filter(m=>text.includes(m))};},cfg);
 return observed;
}
`;
}
export class EgoBrowser implements WorkspaceBrowser {
  private root: string;
  private execute: typeof runEgo;
  private testSpaceId?: number;
  private pageLabel: string;
  constructor(root = process.cwd(), execute = runEgo, testSpaceId?: number, pageLabel = 'p1') {
    this.root = root;
    this.execute = execute;
    this.testSpaceId = testSpaceId;
    this.pageLabel = pageLabel;
  }
  private async config(id: string) {
    const config = (await loadBrowserConfig(this.root)).find((p) => p.id === id);
    if (!config) throw new Error('没有该平台的后台配置');
    return config;
  }
  private async beforePage(platformChange = false) {
    if (this.execute !== runEgo) return;
    const policy = await loadBrowserPolicy(this.root);
    await consumePage(this.root);
    await pause(randomBetween(platformChange ? policy.platformDelayMs : policy.actionDelayMs));
  }
  async openLogin(platformId: string) {
    const config = await this.config(platformId);
    await this.beforePage();
    const opened = (await this.execute(`${stateScript(this.root, config)}
const task=await taskSpace(${this.testSpaceId ?? JSON.stringify('工作台登录 ' + platformId + ' ' + Date.now())});
const page=task.page(${JSON.stringify(this.pageLabel)});await navigate(page);
const observed=await observe(page);
console.log('WORKSPACE_RESULT:'+JSON.stringify({spaceId:task.spaceId,page:page.label,observed}));
if(verified(observed)){await saveState(page);${this.testSpaceId ? '' : 'await task.finish({keep:[page.label]});'}}else await task.handOff();`)) as {
      spaceId: number;
      page: string;
      observed: { url: string; positive: string[]; negative: string[]; risk?: string[] };
    };
    const result = this.result(config, opened.observed);
    return { spaceId: opened.spaceId, page: opened.page, result: result.state === 'logged_in' ? result : undefined };
  }

  async requestConfirmation(platformId: string, spaceId: number, label = 'p1') {
    const config = await this.config(platformId);
    if (!config.confirmation) throw new Error('平台没有快捷确认登录配置');
    const policy = await loadBrowserPolicy(this.root);
    const observed = (await this.execute(`${stateScript(this.root, config)}
const task=await taskSpace(${spaceId});const page=task.page(${JSON.stringify(label)});
const before=await observe(page);
if(!verified(before)) {
 await page.snapshot();
 await page.waitForTimeout(${randomBetween(policy.actionDelayMs)});
 await page.click(${JSON.stringify(config.confirmation.button)});
}
console.log('WORKSPACE_RESULT:'+JSON.stringify(await observe(page)));`)) as {
      url: string;
      positive: string[];
      negative: string[];
      risk?: string[];
    };
    return { ...this.result(config, observed), spaceId, page: label };
  }
  async observeLogin(platformId: string, spaceId: number, label = 'p1'): Promise<LoginResult> {
    const config = await this.config(platformId);
    const observed = (await this.execute(`${stateScript(this.root, config)}
const entry=(await listTaskSpaces()).find(s=>s.id===${spaceId});
if(!entry || entry.ownership!=='agent') {
 console.log('WORKSPACE_RESULT:'+JSON.stringify({pageAvailability:!entry?'closed':'user',unavailable:!entry?'登录页面已关闭，请重新启动该平台采集':'登录页面由你控制；确认后请恢复采集',url:cfg.url,positive:[],negative:[],risk:[]}));
} else {
 const task=await taskSpace(${spaceId});const page=task.page(${JSON.stringify(label)});
 const observed=await observe(page);console.log('WORKSPACE_RESULT:'+JSON.stringify(observed));
}`)) as {
      url: string;
      positive: string[];
      negative: string[];
      risk?: string[];
      unavailable?: string;
      pageAvailability?: 'closed' | 'user';
    };
    if (observed.unavailable)
      return {
        ...this.result(config, observed),
        state: 'unknown',
        reason: observed.unavailable,
        pageAvailability: observed.pageAvailability,
      };
    return this.result(config, observed);
  }
  async finishLogin(platformId: string, spaceId: number, label: string) {
    const config = await this.config(platformId);
    const observed = (await this.execute(`${stateScript(this.root, config)}
const task=await takeOverTaskSpace(${JSON.stringify(spaceId)});const page=task.page(${JSON.stringify(label)});
const observed=await observe(page);if(verified(observed))await saveState(page);console.log('WORKSPACE_RESULT:'+JSON.stringify(observed));
await task.finish({keep:[page.label]});`)) as { url: string; positive: string[]; negative: string[]; risk?: string[] };
    return this.result(config, observed);
  }
  private result(
    config: BrowserPlatform,
    observed: { url: string; positive: string[]; negative: string[]; risk?: string[] },
  ): LoginResult {
    const result = detectLogin(
      config,
      observed.url,
      [...observed.positive, ...observed.negative, ...(observed.risk ?? [])].join('\n'),
    );
    return {
      platformId: config.id,
      ...result,
      checkedAt: new Date().toISOString(),
      statePath: result.state === 'logged_in' ? `data/browser/${config.id}.json` : null,
    };
  }
  async checkLogins(platformIds?: string[]) {
    const active = (await loadConfig(path.join(this.root, 'config'))).platforms
      .filter((p) => p.active)
      .map((p) => p.id);
    const ids = [...new Set(platformIds ?? active)];
    const configs = (await Promise.all(ids.map((id) => this.config(id)))).sort(
      (a, b) => Number(!!a.confirmation) - Number(!!b.confirmation),
    );
    let stopped = false;
    let awaiting = false;
    const results: LoginResult[] = [];
    // One TaskSpace for the complete check command, all platforms reuse the assigned collection tab.
    const spaceId = (await this.execute(
      `const t=await taskSpace(${this.testSpaceId ?? JSON.stringify('工作台登录检查 ' + Date.now())});console.log('WORKSPACE_RESULT:'+JSON.stringify(t.spaceId));`,
    )) as number;
    for (const config of configs) {
      const id = config.id;
      try {
        await this.beforePage(results.length > 0);
        const observed = (await this.execute(`${stateScript(this.root, config)}
const task=await taskSpace(${spaceId});const page=task.page(${JSON.stringify(this.pageLabel)});await navigate(page);
const observed=await observe(page);
if(verified(observed))await saveState(page);
console.log('WORKSPACE_RESULT:'+JSON.stringify(observed));`)) as {
          url: string;
          positive: string[];
          negative: string[];
          risk?: string[];
        };
        const result = this.result(config, observed);
        if (result.state === 'awaiting_confirmation') {
          awaiting = true;
          result.spaceId = spaceId;
          result.page = this.pageLabel;
        }
        results.push(result);
      } catch (error) {
        results.push({
          platformId: id,
          state: 'unknown',
          reason: error instanceof Error ? error.message : '检查失败',
          checkedAt: new Date().toISOString(),
          statePath: null,
        });
        stopped = true;
        // A browser error may indicate user takeover: stop instead of driving another page.
        break;
      }
    }
    if (!this.testSpaceId && !stopped && !awaiting)
      await this.execute(
        `const t=await taskSpace(${spaceId});await t.finish({keep:[]});console.log('WORKSPACE_RESULT:true');`,
      );
    for (const id of ids.filter((id) => !results.some((r) => r.platformId === id)))
      results.push({
        platformId: id,
        state: 'unknown',
        reason: '浏览器检查已停止，尚未检查',
        checkedAt: new Date().toISOString(),
        statePath: null,
      });
    return results;
  }
}
