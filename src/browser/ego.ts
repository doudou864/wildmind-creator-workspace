import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from '../lib/config.ts';
import { detectLogin, loadBrowserConfig, type BrowserPlatform } from './config.ts';
import type { LoginResult, WorkspaceBrowser } from './interface.ts';

// The CLI owns the browser; no platform HTTP/API calls occur here.
export function runEgo(script: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('浏览器操作超时；请查看 ego 窗口，未自动重试'));
    }, 90_000);
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
        reject(new Error('ego 操作失败或控制权已交给用户；请查看浏览器，不自动重试'));
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
  });
}

// Only scoped cookies/localStorage are stored, with owner-only permissions. Never print them.
function stateScript(root: string, config: BrowserPlatform) {
  return `
const fs=await import('node:fs/promises');
const cfg=${JSON.stringify(config)};
const directory=${JSON.stringify(path.join(root, 'data/browser'))};
const filename=${JSON.stringify(path.join(root, 'data/browser', `${config.id}.json`))};
const scoped=(cookie)=>cfg.domains.some(d=>cookie.domain.replace(/^\\./,'')===d || cookie.domain.endsWith('.'+d));
async function restore(page){
 let state;try{state=JSON.parse(await fs.readFile(filename,'utf8'));}catch(e){if(e.code==='ENOENT')return;throw new Error('登录资料无法读取');}
 const live=(await page.cdp('Network.getAllCookies')).cookies.filter(scoped);
 if(live.length)return;
 const cookies=state.cookies.filter(scoped).filter(c=>!c.expires || c.expires<0 || c.expires>Date.now()/1000).map(c=>{
  const result={name:c.name,value:c.value,domain:c.domain,path:c.path,secure:c.secure,httpOnly:c.httpOnly,sameSite:c.sameSite};
  if(c.expires>0)result.expires=c.expires;
  if(c.partitionKey)result.partitionKey=c.partitionKey;
  return result;
 });
 if(cookies.length)await page.cdp('Network.setCookies',{cookies});
 if(state.origin===new URL(cfg.url).origin && state.localStorage){
  await page.cdp('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin==='+JSON.stringify(state.origin)+'){const values='+JSON.stringify(state.localStorage)+';for(const [k,v] of Object.entries(values))if(localStorage.getItem(k)===null)localStorage.setItem(k,v);}'});
 }
}
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
function verified(o){return new URL(o.url).origin===new URL(cfg.url).origin && cfg.loggedInPath && new URL(o.url).pathname.includes(cfg.loggedInPath) && cfg.loggedIn.length>0 && o.positive.length===cfg.loggedIn.length && !o.negative.length;}
async function observe(page){
 // Give automatic login redirects time to finish; only return booleans/URL, never page text.
 try{await page.waitForFunction((c)=>c.loggedIn.length>0 && c.loggedIn.every(m=>document.body.innerText.includes(m)),cfg,{timeout:10000});}catch{}
 const observed=await page.evaluate(c=>({url:location.href,positive:c.loggedIn.filter(m=>document.body.innerText.includes(m)),negative:c.loggedOut.filter(m=>document.body.innerText.includes(m))}),cfg);
 return observed;
}
`;
}
export class EgoBrowser implements WorkspaceBrowser {
  private root: string;
  private execute: typeof runEgo;
  private testSpaceId?: number;
  constructor(root = process.cwd(), execute = runEgo, testSpaceId?: number) {
    this.root = root;
    this.execute = execute;
    this.testSpaceId = testSpaceId;
  }
  private async config(id: string) {
    const config = (await loadBrowserConfig(this.root)).find((p) => p.id === id);
    if (!config) throw new Error('没有该平台的后台配置');
    return config;
  }
  async openLogin(platformId: string) {
    const config = await this.config(platformId);
    const opened = (await this.execute(`${stateScript(this.root, config)}
const task=await taskSpace(${this.testSpaceId ?? JSON.stringify('工作台登录 ' + platformId + ' ' + Date.now())});
const page=task.page('p1');await restore(page);await navigate(page);
const observed=await observe(page);
console.log('WORKSPACE_RESULT:'+JSON.stringify({spaceId:task.spaceId,page:page.label,observed}));
if(verified(observed)){await saveState(page);${this.testSpaceId ? '' : 'await task.finish({keep:[page.label]});'}}else await task.handOff();`)) as {
      spaceId: number;
      page: string;
      observed: { url: string; positive: string[]; negative: string[] };
    };
    const result = this.result(config, opened.observed);
    return { spaceId: opened.spaceId, page: opened.page, result: result.state === 'logged_in' ? result : undefined };
  }

  async finishLogin(platformId: string, spaceId: number, label: string) {
    const config = await this.config(platformId);
    const observed = (await this.execute(`${stateScript(this.root, config)}
const task=await takeOverTaskSpace(${JSON.stringify(spaceId)});const page=task.page(${JSON.stringify(label)});
const observed=await observe(page);if(verified(observed))await saveState(page);console.log('WORKSPACE_RESULT:'+JSON.stringify(observed));
await task.finish({keep:[page.label]});`)) as { url: string; positive: string[]; negative: string[] };
    return this.result(config, observed);
  }
  private result(
    config: BrowserPlatform,
    observed: { url: string; positive: string[]; negative: string[] },
  ): LoginResult {
    const result = detectLogin(config, observed.url, [...observed.positive, ...observed.negative].join('\n'));
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
    const configs = await Promise.all(ids.map((id) => this.config(id)));
    let stopped = false;
    const results: LoginResult[] = [];
    // One TaskSpace for the complete check command, all platforms reuse p1.
    const spaceId = (await this.execute(
      `const t=await taskSpace(${this.testSpaceId ?? JSON.stringify('工作台登录检查 ' + Date.now())});console.log('WORKSPACE_RESULT:'+JSON.stringify(t.spaceId));`,
    )) as number;
    for (const config of configs) {
      const id = config.id;
      try {
        const observed = (await this.execute(`${stateScript(this.root, config)}
const task=await taskSpace(${spaceId});const page=task.page('p1');await restore(page);await navigate(page);
const observed=await observe(page);
if(verified(observed))await saveState(page);
console.log('WORKSPACE_RESULT:'+JSON.stringify(observed));`)) as {
          url: string;
          positive: string[];
          negative: string[];
        };
        results.push(this.result(config, observed));
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
    if (!this.testSpaceId && !stopped)
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
