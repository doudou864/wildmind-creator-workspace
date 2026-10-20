// Isolated fixture preview of the real publishing UI. All writes stay in memory.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';
const root = process.cwd(),
  out = 'docs/verification/u9/b';
mkdirSync(out, { recursive: true });
const yaml = (n) => parse(readFileSync(`config/${n}.yaml`, 'utf8'));
const runtime = `import React from'react';import{createRoot}from'react-dom/client';import Publishing from'./src/app/publishing/publishing-page';import{newPublishDraft}from'./src/lib/publishing-model';
const mode=new URLSearchParams(location.search).get('stage')||'editable';const content={id:'fixture-content',fixture:true,title:'测试成片',form:'视频',topicId:null,videoCovers:{},updatedAt:'2026-10-20'};
const video={id:'fixture-video',fixture:true,contentId:content.id,name:'fixture-final.mp4',bytes:1667,duration:1,width:64,height:64};
const draft={...newPublishDraft('video'),contentId:content.id,videoId:video.id,commonCopy:{title:'测试成片',description:'fixture',tags:[]},settings:[{platformId:'douyin',title:'测试成片',description:'fixture',tags:[],scheduledAt:null,individuallyEdited:false}]};
const batch={id:'fixture-batch',fixture:true,revision:0,state:mode==='editable'?'draft':'prepared',draft,createdAt:'2026-10-20'};
const receipt={id:'fixture-receipt',batchId:batch.id,platformId:'douyin',status:mode==='published'?'published':mode==='blocked'?'unknown':'ready',screenshotAssetId:null,uploadedAt:'2026-10-20T00:00:00Z',materials:null,failureStage:null,title:'测试成片',platformPostId:null,url:null,publishedAt:mode==='published'?'2026-10-20T00:00:00Z':null,reason:null,safeToRetry:false,revision:0};
window.__data={contents:[content],videos:[video],assets:[],snapshots:[],batches:[batch],receipts:mode==='editable'?[]:[receipt],accounts:[],recommendations:[],storageReady:false,aiReady:false,handoffReady:false,uploadReady:false,publishReady:false,message:''};
window.__listing={directories:['/fixture/成片'],items:[{path:'/fixture/成片/fixture-final.mp4',name:'fixture-final.mp4',bytes:1667,modifiedAt:'2026-10-20T00:00:00Z',duration:1}],errors:[]};
window.fetch=()=>Promise.reject(Error('No network in fixture preview'));window.__request=async(url,init)=>{if(url==='/api/publishing/local-videos')return init?.method==='POST'?{video}:window.__listing;if(url.includes('/abandon')){window.__data={...window.__data,batches:[{...batch,revision:1,abandonedAt:'2026-10-20T01:00:00Z'}]};return{batch:window.__data.batches[0]}}throw Error('Fixture write blocked');};
createRoot(document.getElementById('root')).render(<Publishing initialData={window.__data} initialContent={content.id} initialKind="video" config={${JSON.stringify(yaml('publishing-templates'))}} layoutConfig={${JSON.stringify(yaml('layout-styles'))}} platforms={${JSON.stringify(yaml('platforms').platforms)}} today="2026-10-20" syncWindow="10:30–10:45" expiryHours={2} managementPages={{douyin:'about:blank'}}/>);`;
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
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({ path: a.path, namespace: 'fixture' }));
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          resolveDir: root,
          loader: 'tsx',
          contents:
            a.path === 'next/link'
              ? `import React from'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`
              : a.path === 'next/navigation'
                ? `export const usePathname=()=>'/publishing';export const useRouter=()=>({replace(){},refresh(){}});`
                : `import{useState}from'react';export const request=(...a)=>window.__request(...a);export function useResource(url,initial){const[data,setData]=useState(url==='/api/contents'?{items:window.__data.contents,topics:[],recordsReady:true,writeReady:false}:initial);return{data,error:'',refresh:async()=>setData(window.__data)}}`,
        }));
      },
    },
  ],
});
const css = ['tokens', 'workspace', 'images', 'layouts', 'publishing']
  .map((n) => readFileSync(`src/ui/${n}.css`, 'utf8'))
  .join('\n');
writeFileSync(
  out + '/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>U9 发布隔离测试</title><style>*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
