// Isolated fixture preview of the real publishing UI. All writes stay in memory.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';
const root = process.cwd(),
  out = process.argv[2] ?? 'docs/verification/publishing-simple';
mkdirSync(out, { recursive: true });
const yaml = (n) => parse(readFileSync(`config/${n}.yaml`, 'utf8'));
const runtime = `import React from'react';import{createRoot}from'react-dom/client';import Publishing from'./src/app/publishing/publishing-page';import{newPublishDraft,publishDraftSchema,platformMaterialKey}from'./src/lib/publishing-model';
const config=${JSON.stringify(yaml('publishing-templates'))};const platforms=${JSON.stringify(yaml('platforms').platforms)};
const key='publishing-simple-fixture-v1';const mode=new URLSearchParams(location.search).get('stage');
const stamp=new Date().toISOString();
const asset=(id,w,h)=>({id,fixture:true,familyId:id,contentId:null,topicId:null,title:'隔离测试封面 '+id,purposeId:'video_cover',ratio:w+':'+h,width:w,height:h,mime:'image/svg+xml',source:'ai',prompt:'fixture',version:1,selected:false,createdAt:stamp,updatedAt:stamp});
const base={topics:[{id:'fixture-topic',fixture:true,title:'隔离测试：用AI整理工作'}],contents:[],videos:[],assets:[asset('fixture-portrait',750,1000),asset('fixture-landscape',1000,750),asset('fixture-wide',1600,900)],snapshots:[],batches:[],receipts:[],accounts:[],recommendations:[],storageReady:true,aiReady:false,handoffReady:false,uploadReady:false,publishReady:false,message:''};
window.__data=JSON.parse(localStorage.getItem(key)||'null')||base;window.__calls=[];
if(mode==='ready'||mode==='draft'){
config.templates=config.templates.map(t=>({...t,verified:true,titleMax:200,descriptionMax:1000}));
const draft={...newPublishDraft('video'),contentId:'fixture-content',commonCopy:{title:'隔离测试上传完成',description:'',tags:['AI']},videoInput:{topicId:null,path:'/fixture/video.mp4',covers:{'3:4':'fixture-portrait','4:3':'fixture-landscape','16:9':'fixture-wide'}},settings:[{platformId:'douyin',title:'隔离测试上传完成',description:'',tags:['AI'],scheduleAt:null,individuallyEdited:false}]};
const batch={id:'fixture-ready',fixture:true,revision:1,state:mode==='ready'?'prepared':'draft',draft,createdAt:stamp};
window.__data={...base,contents:[{id:'fixture-content',fixture:true,title:draft.commonCopy.title,form:'视频',topicId:null,videoCovers:{},plannedDate:null,updatedAt:stamp}],batches:[batch],accounts:[{platformId:'douyin',ready:true,reason:''}],uploadReady:true,uploadPlatforms:platforms.map(p=>p.id),publishReady:true};
if(mode==='ready')window.__data.receipts=[{id:'fixture-receipt',batchId:batch.id,platformId:'douyin',status:'ready',screenshotAssetId:'fixture-wide',uploadedAt:stamp,materials:platformMaterialKey(draft,'douyin',window.__data,config),failureStage:null,title:draft.commonCopy.title,platformPostId:null,url:null,publishedAt:null,reason:null,safeToRetry:false,revision:1}];
}
window.fetch=()=>Promise.reject(Error('Fixture network blocked'));
window.__request=async(url,init)=>{window.__calls.push({url,method:init?.method,body:init?.body});
if(url==='/api/publishing') return structuredClone(window.__data);
if(url.includes('/actions')) {
const body=JSON.parse(init.body);if(!['upload','upload-and-publish','publish-all'].includes(body.action)||(body.action!=='upload'&&!body.confirmed))throw Error('Fixture action rejected');
document.getElementById('fixture-result').textContent='隔离请求：'+body.action+'；确认：'+String(body.confirmed===true);
const batch=window.__data.batches[0];batch.state=body.action==='upload'?'prepared':'finished';batch.revision++;
window.__data.receipts=[{id:'fixture-receipt',batchId:batch.id,platformId:'douyin',status:body.action==='upload'?'ready':'pending_review',screenshotAssetId:'fixture-wide',uploadedAt:stamp,materials:platformMaterialKey(batch.draft,'douyin',window.__data,config),failureStage:null,title:batch.draft.commonCopy.title,platformPostId:null,url:null,publishedAt:null,reason:'FIXTURE：隔离模拟回执',safeToRetry:false,revision:1}];
return structuredClone(batch);}

if(url.startsWith('/api/publishing/drafts')){const draft=publishDraftSchema.parse(JSON.parse(init.body));const previous=window.__data.batches.find(b=>url.endsWith('/'+b.id));draft.contentId||=previous?.draft.contentId||'fixture-content-'+crypto.randomUUID();const batch={id:previous?.id||'fixture-'+crypto.randomUUID(),fixture:true,revision:(previous?.revision??-1)+1,state:'draft',draft,createdAt:stamp};window.__data.contents=[...window.__data.contents.filter(c=>c.id!==draft.contentId),{id:draft.contentId,fixture:true,title:draft.commonCopy.title,form:'视频',topicId:draft.videoInput?.topicId??null,videoCovers:{},plannedDate:null,updatedAt:stamp}];window.__data.batches=[...window.__data.batches.filter(b=>b.id!==batch.id),batch];localStorage.setItem(key,JSON.stringify(window.__data));return structuredClone(batch);}
throw Error('Fixture write blocked: '+url);};
createRoot(document.getElementById('root')).render(<Publishing initialData={window.__data} initialKind="video" config={config} layoutConfig={${JSON.stringify(yaml('layout-styles'))}} platforms={platforms} today="2026-10-24" syncWindow="10:30–10:45" expiryHours={2} managementPages={{douyin:'about:blank'}}/>);`;
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
                : readFileSync('src/ui/use-resource.ts', 'utf8')
                    .replace(
                      "import { visibleRecords } from './visible-records.ts';",
                      'const visibleRecords = <T,>(data:T):T => data;',
                    )
                    .replace(
                      /export async function request<T>[\s\S]*?export function useResource/,
                      'export async function request<T>(...args:any[]):Promise<T>{return window.__request(...args)}\nexport function useResource',
                    ),
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
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>视频发布四项输入 · 隔离测试</title><style>*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css +
    '</style><div id="root"></div><p id="fixture-result" role="status">隔离测试：所有操作仅模拟，无平台写入</p><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
