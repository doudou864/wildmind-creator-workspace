// Isolated fixture preview of the real publishing UI. All writes stay in memory.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';
const root = process.cwd(),
  out = 'docs/verification/cover-chat';
mkdirSync(out, { recursive: true });
const yaml = (n) => parse(readFileSync(`config/${n}.yaml`, 'utf8'));
const runtime = `import React from'react';import{createRoot}from'react-dom/client';import ImagesPage from'./src/app/images/images-page';
const config=${JSON.stringify(yaml('image-styles'))};const stamp=new Date().toISOString();
const key='cover-chat-fixture-data';const initial={assets:[],drafts:[],topics:[],contents:[],contentWriteReady:true,generationReady:true,storageReady:true,generationMessage:''};
window.__data=JSON.parse(localStorage.getItem(key)||'null')||{data:initial,turns:[]};window.__calls=[];
const skills=[{id:'fixture-editorial',name:'doudou-editorial-cover',description:'测试技能：米白纸感技术档案封面'},{id:'fixture-video',name:'video-cover-image2',description:'测试技能：视频封面'}];
window.__request=async(url)=>{if(url==='/api/images')return structuredClone(window.__data.data);if(url.startsWith('/api/images/chat?session='))return{turns:window.__data.turns.filter(t=>t.sessionId===url.split('=')[1]),skills};throw Error('Fixture request blocked '+url);};
window.fetch=async(url,init)=>{if(url!=='/api/images/chat'||init?.method!=='POST')throw Error('Fixture network blocked');const body=JSON.parse(init.body);window.__calls.push(body);const dims=[[750,1000],[1000,750],[1600,900]];const made=dims.map(([w,h],i)=>({id:'fixture-'+i,familyId:'fixture-'+i,contentId:null,topicId:null,title:'FIXTURE 隔离测试 '+(i+1),purposeId:'video_cover',ratio:['3:4','4:3','16:9'][i],width:w,height:h,mime:'image/svg+xml',source:'ai',prompt:body.text,version:1,selected:false,createdAt:stamp,updatedAt:stamp}));window.__data.data.assets=made;const turn={...body,input:body.text,skillName:skills.find(s=>s.id===body.skillId)?.name??null,output:'已按原文和所选技能完成三种比例的测试图片。',status:'success',error:null,assetIds:made.map(a=>a.id)};window.__data.turns.push(turn);localStorage.setItem(key,JSON.stringify(window.__data));return new Response(JSON.stringify({type:'done',turn})+'\\n',{headers:{'Content-Type':'application/x-ndjson'}});};
createRoot(document.getElementById('root')).render(<ImagesPage initialData={window.__data.data} config={config} today="2026-10-23" syncWindow="10:30–10:45" initialTopic={null}/>);`;
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
                ? `export const usePathname=()=>'/images';export const useRouter=()=>({replace(){},refresh(){}});`
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
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>封面对话 · 隔离测试</title><style>*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
