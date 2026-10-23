// Isolated fixture preview of the real TopicsPage. All requests stay in this HTML's local fixture store.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../src/lib/config.ts';
const config = await loadConfig();
const runtime = `import React from 'react';import{createRoot}from'react-dom/client';import TopicsPage from './src/app/topics/topics-page';
const key='wildmind-topic-workflow-fixture';
const channels=['登录受限站点','连接失败站点','公开资料站点'].map((name,i)=>({id:'fixture-'+i,name,enabled:true,kind:'external',type:'网页',location:'https://example.com/'+i,focus:'fixture',frequency:'fixture',note:'fixture'}));
const read=()=>JSON.parse(localStorage.getItem(key)||'null');
window.__request=async(url,init)=>{
 if(url==='/api/topics/channels')return {channels,revision:'fixture'};
 if(url==='/api/topics/generate'&&init?.method==='POST'){
  if(read()?.status==='running')return {started:false,task:read()};
  const task={id:'fixture-task',pid:1,status:'running',stage:'researching',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),reason:null,warning:null,count:0,sourceCount:0,cachedCount:0,currentSource:channels[2].name,sources:channels.map((c,i)=>({id:c.id,name:c.name,url:c.location,status:i===2?'reading':'failed',reason:i===0?'需要登录后才能访问':i===1?'网络连接失败':null,count:0}))};
  localStorage.setItem(key,JSON.stringify(task));sessionStorage.setItem('fixture-post-count',String(Number(sessionStorage.getItem('fixture-post-count')||0)+1));return {started:true,task};
 }
 if(url==='/api/topics/generate')return {task:read()};
 if(url==='/api/topics/fixture-topic'&&init?.method==='PATCH'){const t=read();t.topicStatus=JSON.parse(init.body).status;localStorage.setItem(key,JSON.stringify(t));return {ok:true};}
 if(url==='/api/topics')return {topics:read()?.status==='completed'?[{id:'fixture-topic',title:'【隔离测试】戴着摄像头做家务，也能领到工资？',direction:'实体：家务采集。角度：日常技能的新收入用途。此为隔离测试材料，非真实机会。',channelId:'fixture-2',signal:'fixture 原文片段',sourceContext:'采集于2026-10-23T12:00:00.000Z',sourceUrl:'https://example.com/2',exploration:false,evidence:null,status:read()?.topicStatus||'candidate',frozenFire:null,frozenEvidence:null,selectedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),automatic:false}]:[],d21Samples:0,generationReady:true,writeReady:true,serviceMessage:'fixture',generation:read()};
 return {};
};
window.fixtureReview=()=>{const t=read();t.stage='reviewing';localStorage.setItem(key,JSON.stringify(t));};
window.fixtureComplete=()=>{const t=read();t.status='completed';t.stage='finished';t.currentSource='';t.count=1;t.sourceCount=2;t.sources[2]={...t.sources[2],status:'completed',count:2};localStorage.setItem(key,JSON.stringify(t));};
createRoot(document.getElementById('root')).render(<TopicsPage parameters={${JSON.stringify(config.parameters)}} channels={channels} platforms={${JSON.stringify(config.platforms)}} initialData={{topics:[],d21Samples:0,generationReady:true,writeReady:true,serviceMessage:'fixture',generation:read()}} today="2026-10-23"/>);`;
const result = await build({
  stdin: { contents: runtime, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'fixture',
      setup(b) {
        b.onResolve({ filter: /next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
        b.onResolve({ filter: /workspace-header$/ }, () => ({ path: 'header', namespace: 'fixture' }));
        b.onResolve({ filter: /archive-controls$/ }, () => ({ path: 'archive', namespace: 'fixture' }));
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents:
            args.path === 'link'
              ? "import React from 'react';export default function Link(p){return <a {...p}/>}"
              : args.path === 'header'
                ? "import React from 'react';export function WorkspaceHeader(){return <header style={{padding:'16px 0'}}>隔离测试 · 选题 / 素材 / 排版 / 发布检查</header>}"
                : args.path === 'archive'
                  ? 'export function ArchiveButton(){return null}'
                  : readFileSync('src/ui/use-resource.ts', 'utf8')
                      .replace('./visible-records.ts', process.cwd() + '/src/ui/visible-records.ts')
                      .replace(
                        /export async function request<T>[\s\S]*?export function useResource/,
                        'export async function request<T>(...args:any[]):Promise<T>{return window.__request(...args)}\nexport function useResource',
                      ),
        }));
      },
    },
  ],
});
mkdirSync('docs/verification/topic-workflow', { recursive: true });
const css = ['tokens', 'workspace', 'topics'].map((n) => readFileSync('src/ui/' + n + '.css', 'utf8')).join('\n');
writeFileSync(
  'docs/verification/topic-workflow/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>选题进度隔离验收</title><style>*{box-sizing:border-box}body{margin:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
