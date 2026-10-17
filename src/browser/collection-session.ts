import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runEgo } from './ego.ts';
import { loadBrowserConfig } from './config.ts';
import { loadBrowserPolicy, consumePage, randomBetween } from './policy.ts';
export class AttentionRequired extends Error {
  kind: 'login' | 'risk';
  constructor(reason: string, kind: 'login' | 'risk') {
    super(reason);
    this.kind = kind;
  }
}
export type PageObservation = {
  url: string;
  text: string;
  scroll: { top: number; height: number; total: number };
  titles: string[];
};
export class CollectionSession {
  public spaceId: number;
  public page: string;
  private execute: typeof runEgo;
  constructor(spaceId: number, page = 'p1', execute = runEgo) {
    this.spaceId = spaceId;
    this.page = page;
    this.execute = execute;
  }
  async run<T>(body: string): Promise<T> {
    return (await this.execute(
      `const task=await taskSpace(${this.spaceId});const page=task.page(${JSON.stringify(this.page)});${body}`,
    )) as T;
  }
  async navigate(url: string, ready: string) {
    await consumePage();
    await this.run(
      `await page.waitForTimeout(${randomBetween((await loadBrowserPolicy()).actionDelayMs)});try{await page.goto(${JSON.stringify(url)});}catch(e){if(!String(e).includes('navigation committed'))throw e;}console.log('WORKSPACE_RESULT:true');`,
    );
    await this.settle(ready);
  }
  async settle(ready?: string) {
    const policy = await loadBrowserPolicy();
    await this.run(
      `await page.waitForTimeout(${randomBetween(policy.dwellMs)});${ready ? `try{await page.waitForSelector(${JSON.stringify(ready)},{timeout:15000});}catch{}` : ''}console.log('WORKSPACE_RESULT:true');`,
    );
  }
  async inspect(platformId: string, scrollSelector = 'html', titleSelector = ''): Promise<PageObservation> {
    const policy = await loadBrowserPolicy();
    const config = (await loadBrowserConfig()).find((p) => p.id === platformId);
    if (!config) throw new Error('平台配置不存在');
    const result = await this.run<PageObservation>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(({scrollSelector,titleSelector})=>{const el=document.querySelector(scrollSelector);if(!el)throw new Error('滚动区域不存在，页面结构变化');return {url:location.href,text:document.body.innerText,scroll:{top:el.scrollTop,height:el.clientHeight,total:el.scrollHeight},titles:titleSelector?Array.from(document.querySelectorAll(titleSelector)).map(e=>e.textContent.trim()):[]};},{scrollSelector:${JSON.stringify(scrollSelector)},titleSelector:${JSON.stringify(titleSelector)}})));`,
    );
    const risk = policy.riskMarkers.find((x) => result.text.includes(x));
    if (risk) throw new AttentionRequired(risk, 'risk');
    if (config.loggedOut.some((x) => result.text.includes(x)))
      throw new AttentionRequired('登录失效，请在浏览器中登录', 'login');
    if (new URL(result.url).origin !== new URL(config.url).origin)
      throw new AttentionRequired('后台跳转到异常登录地址', 'login');
    return result;
  }
  async capture(filename: string) {
    await mkdir(path.dirname(path.resolve(filename)), { recursive: true, mode: 0o700 });
    const result = await this.run<string>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.screenshot({path:${JSON.stringify(path.resolve(filename))}})));`,
    );
    return result;
  }
  async archiveSnapshot(filename: string) {
    const snapshot = await this.run<string>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.snapshot({scope:'full_page'})));`,
    );
    await writeFile(filename, snapshot, { mode: 0o600 });
  }
  async click(selector: string) {
    await consumePage();
    await this.run(
      `await page.waitForTimeout(${randomBetween((await loadBrowserPolicy()).actionDelayMs)});await page.click(${JSON.stringify(selector)});console.log('WORKSPACE_RESULT:true');`,
    );
    await this.settle();
  }
  async scroll(selector = 'html', direction = 1) {
    const policy = await loadBrowserPolicy();
    await this.run(
      `const box=await page.evaluate(selector=>{const e=document.querySelector(selector);if(!e)throw new Error('滚动区域不存在');const r=e.getBoundingClientRect();return {x:Math.min(innerWidth-40,Math.max(250,r.left+r.width/2)),y:Math.min(innerHeight-60,Math.max(200,r.top+Math.min(r.height,innerHeight)/2))};},${JSON.stringify(selector)});await page.mouse.move(box.x,box.y);await page.waitForTimeout(${randomBetween(policy.actionDelayMs)});await page.mouse.wheel(0,${direction * randomBetween(policy.scrollPixels)});console.log('WORKSPACE_RESULT:true');`,
    );
    await this.settle();
  }
  async openDetail(title: string, titleSelector: string) {
    await consumePage();
    const label = await this.run<string>(
      `const titles=await page.evaluate(selector=>Array.from(document.querySelectorAll(selector)).map(e=>e.textContent.trim()),${JSON.stringify(titleSelector)});const index=titles.indexOf(${JSON.stringify(title)});if(index<0)throw new Error('列表中未找到目标作品');await page.waitForTimeout(${randomBetween((await loadBrowserPolicy()).actionDelayMs)});const [next]=await Promise.all([page.waitForEvent('popup',{timeout:60000}),page.click(${JSON.stringify(titleSelector)}+' >> nth='+index)]);console.log('WORKSPACE_RESULT:'+JSON.stringify(next.label));`,
    );
    return new CollectionSession(this.spaceId, label, this.execute);
  }
  async close() {
    await this.run(`await page.close();console.log('WORKSPACE_RESULT:true');`);
  }
}
