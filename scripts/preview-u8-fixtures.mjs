// Isolated browser fixture harness: no database access, no real fetch, no platform operations.
import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
const root = process.cwd(),
  out = path.join(root, 'docs/verification/u8/d');
mkdirSync(out, { recursive: true });
const yaml = (n) => parse(readFileSync(`config/${n}.yaml`, 'utf8'));
const configs = {
  parameters: yaml('parameters'),
  platforms: yaml('platforms').platforms,
  images: yaml('image-styles'),
  layouts: yaml('layout-styles'),
  publishing: yaml('publishing-templates'),
  channels: [],
};
const runtime = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import Topics from './src/app/topics/topics-page';import Images from './src/app/images/images-page';import Layouts from './src/app/layouts/layouts-page';import Publishing from './src/app/publishing/publishing-page';import {CreationShell} from './src/ui/creation-shell';import {createLayout} from './src/lib/layout-model';
const configs=${JSON.stringify(configs)};
const params=new URLSearchParams(location.search),step=params.get('step')||'topic',video=params.get('video')==='1';
const content={id:'fixture-u8-content',fixture:true,title:'测试样本：封面与稿件交接',form:video?'视频':'图文',topicId:'fixture-u8-topic',plannedDate:null,videoCovers:{},updatedAt:'2026-10-20T00:00:00Z'};
const topic={id:'fixture-u8-topic',fixture:true,title:'测试样本：封面与稿件交接',direction:'只验证界面，不占用真实选题',channelId:'fixture',signal:'测试数据',sourceContext:'测试数据',sourceUrl:null,exploration:false,evidence:null,status:'selected',frozenFire:null,frozenEvidence:null,selectedAt:'2026-10-20T00:00:00Z',automatic:false,createdAt:'2026-10-20T00:00:00Z',updatedAt:'2026-10-20T00:00:00Z'};
const asset=(id,ratio,width,height)=>({id,fixture:true,familyId:id,contentId:content.id,topicId:topic.id,title:'测试封面',purposeId:configs.images.purposes[0].id,ratio,path:'fixture',width,height,mime:'image/png',source:'upload',prompt:'测试',version:1,selected:true,createdAt:content.updatedAt,updatedAt:content.updatedAt});
const assets=[asset('fixture-square','1:1',1000,1000),asset('fixture-portrait','3:4',900,1200)];
const document={...createLayout('测试稿件标题\\n\\n这是测试正文，用于核对长文本自动增高与平台切换。',content.id),id:'fixture-u8-layout',fixture:true,updatedAt:content.updatedAt};
document.variants.wechat.covers={'1:1':'fixture-square'};document.variants.douyin.blocks.push({id:'fixture-image',type:'image',text:'',assetId:'fixture-portrait'});
const imageData={assets,drafts:[],topics:[topic],contents:[content],tasks:[],generations:[],contentWriteReady:true,generationReady:false,storageReady:false,generationMessage:''};
const layoutData={documents:params.has('empty')?[]:[document],contents:[content],assets,storageReady:false,aiReady:false,handoffReady:true,message:''};
const pubData={contents:[content],assets,videos:[],snapshots:[],batches:[],receipts:[],accounts:[],recommendations:[],storageReady:false,aiReady:false,handoffReady:true,uploadReady:false,publishReady:false,message:''};
window.__fixtureResources={'/api/contents':{items:[content],topics:[topic],recordsReady:true,writeReady:false,message:''},'/api/images':imageData,'/api/layouts':layoutData,'/api/publishing':pubData};
window.fetch=()=>Promise.reject(new Error('Fixture harness blocks all network requests'));
const shared={today:'2026-10-20',syncWindow:configs.parameters.syncWindow,initialContent:content.id};
const page=step==='topic'?<Topics parameters={configs.parameters} channels={[]} platforms={configs.platforms} initialData={{topics:[topic],d21Samples:0,generationReady:false,writeReady:false,serviceMessage:''}} today={shared.today}/>:step==='materials'?<Images {...shared} initialTopic={topic.id} config={configs.images} initialData={imageData}/>:step==='layout'?<Layouts {...shared} config={configs.layouts} initialData={layoutData}/>:<Publishing {...shared} initialKind={video?'video':'layout'} config={configs.publishing} layoutConfig={configs.layouts} platforms={configs.platforms} initialData={pubData} expiryHours={configs.parameters.publishUploadExpiryHours}/>;
createRoot(documentRoot()).render(<CreationShell content={content} step={step} query={params.toString()} date={shared.today} syncWindow={shared.syncWindow}>{page}</CreationShell>);
function documentRoot(){return globalThis.document.getElementById('root');}
`;
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
      name: 'fixture-isolation',
      setup(b) {
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({ path: a.path, namespace: 'fixture' }));
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, (a) => ({ path: 'resource', namespace: 'fixture' }));
        b.onResolve({ filter: /asset-image(?:\.tsx)?$/ }, (a) => ({ path: 'asset', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          loader: 'tsx',
          resolveDir: root,
          contents:
            a.path === 'next/link'
              ? `import React from 'react';export default function Link({href,children,...props}){let u=new URL(href,'http://fixture');if(u.pathname==='/create')href='?'+u.searchParams.toString();return <a {...props} href={href}>{children}</a>;}`
              : a.path === 'next/navigation'
                ? `export const usePathname=()=>'/create';export const useRouter=()=>({refresh(){},push(href){const u=new URL(href,'http://fixture');location.search=u.search;},replace(href){const u=new URL(href,'http://fixture');location.search=u.search;}});`
                : a.path === 'resource'
                  ? `import {useState,useCallback} from 'react';export const request=async()=>{throw Error('测试预览禁止写操作')};export function useResource(url,initial,fetchOnMount){const [data]=useState(()=>fetchOnMount?window.__fixtureResources[url]??initial:initial);const refresh=useCallback(async()=>{},[]);return {data,error:'',refresh};}`
                  : `import React from 'react';export function AssetImage({alt,className}){return <div className={className} role="img" aria-label={alt} style={{background:'#CFCDC7',padding:20}}>测试素材</div>;}`,
        }));
      },
    },
  ],
});
const css = ['tokens', 'workspace', 'topics', 'images', 'layouts', 'publishing', 'inbox', 'deals', 'data-center']
  .map((n) => readFileSync(`src/ui/${n}.css`, 'utf8'))
  .join('\n');
writeFileSync(
  path.join(out, 'fixture-preview.html'),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>U8 隔离 fixture 预览</title><style>*{box-sizing:border-box}body{margin:0}button,a,input,textarea,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
console.log('Fixture preview written; no database or external requests.');
