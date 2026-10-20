// Explicit fixtures only; all HTTP, clipboard and navigation effects are in-memory substitutes.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const root = process.cwd(),
  out = 'docs/verification/u9/e';
mkdirSync(out, { recursive: true });
const runtime = `import React from'react';import{createRoot}from'react-dom/client';import{WorkspaceHeader}from'./src/ui/workspace-header';import{PageHeader,Card}from'./src/ui/components';import{TodayAttention}from'./src/ui/today-attention';import{ArchiveButton}from'./src/ui/archive-controls';import{ReplyDraft}from'./src/ui/reply-draft';
window.__archives=[];window.__request=async(url,init)=>{if(url==='/api/archives'){if(init?.method==='POST'){const input=JSON.parse(init.body);window.__archives=input.archived?[...window.__archives,{kind:input.kind,recordId:input.id,title:'测试记录',fixture:true,archivedAt:'2026-10-20T00:00:00Z'}]:window.__archives.filter(r=>r.recordId!==input.id);return{}}return{items:window.__archives}}if(url==='/api/workspace-attention')return{warnings:[{platformId:'fixture',reason:'测试平台超过 1 天未更新，最近成功：10-18'}],newVideos:[{path:'/fixture/final.mp4',name:'测试成片.mp4',bytes:1048576,duration:10}],fileErrors:[]};if(url.includes('/reply-draft'))return{draft:'测试回复草稿：可以先按作品整理素材，再按用途补标签。'};if(url==='/api/contents/from-video'){window.__created=JSON.parse(init.body);return{contentId:'fixture-new'}}throw Error('fixture blocks unknown writes')};window.fetch=()=>Promise.reject(Error('No network'));Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text}}});
createRoot(document.getElementById('root')).render(<main className="workspace"><WorkspaceHeader current="/" date="2026-10-20" syncWindow="10:30–10:45"/><PageHeader title="今天" summary="先查看采集提醒，再整理待办" onRefresh={()=>{}}/><TodayAttention/><Card title="记录整理"><p>这些都是隔离的测试记录。</p>{['content','layout','image_draft','asset','topic'].map(kind=><ArchiveButton key={kind} kind={kind} id={'fixture-'+kind}/>)}</Card><Card title="消息详情"><p>测试消息：如何整理素材？</p><ReplyDraft id="fixture-message"/></Card></main>);`;
const result = await build({
  stdin: { contents: runtime, resolveDir: root, loader: 'tsx' },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [
    {
      name: 'fixture',
      setup(b) {
        b.onLoad({ filter: /archive-controls\.tsx$/ }, (a) => ({
          loader: 'tsx',
          contents: readFileSync(a.path, 'utf8').replace('.items.filter((row) => !row.fixture)', '.items'),
        }));
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({ path: a.path, namespace: 'fixture' }));
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          loader: 'tsx',
          resolveDir: root,
          contents:
            a.path === 'next/link'
              ? `import React from'react';export default function Link(props){return <a {...props}/>}`
              : a.path === 'next/navigation'
                ? `export const useRouter=()=>({refresh(){},replace(url){window.__navigation=url},push(url){window.__navigation=url}});`
                : `import{useState,useEffect}from'react';export const request=(...args)=>window.__request(...args);export function useResource(url,initial){const[data,setData]=useState(initial);useEffect(()=>{request(url).then(setData)},[url]);return{data,error:'',refresh:async()=>setData(await request(url))}}`,
        }));
      },
    },
  ],
});
const css =
  ['tokens', 'workspace', 'inbox'].map((n) => readFileSync('src/ui/' + n + '.css', 'utf8')).join('\n') +
  readFileSync('src/app/globals.css', 'utf8').slice(readFileSync('src/app/globals.css', 'utf8').indexOf('.undo-toast'));
writeFileSync(
  out + '/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>U9 E 隔离测试</title><style>*{box-sizing:border-box}body{margin:0}button,input,textarea,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
