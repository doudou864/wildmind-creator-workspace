// Isolated browser acceptance: real components, fixture-only persistence and delayed replies.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';
const root = process.cwd(),
  out = 'docs/verification/image-conversations';
mkdirSync(out, { recursive: true });
const config = parse(readFileSync('config/image-styles.yaml', 'utf8'));
const runtime = `import React from 'react';import {createRoot} from 'react-dom/client';import ImagesPage from './src/app/images/images-page';import {CreationShell} from './src/ui/creation-shell';
const config=${JSON.stringify(config)},stamp='2026-10-23T14:00:00.000Z',key='image-conversation-fixture';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const assets=[[750,1000],[1000,750],[1600,900]].map(([w,h],i)=>({id:'fixture-'+i,familyId:'fixture-'+i,title:'FIXTURE 隔离测试 '+i,contentId:null,topicId:null,purposeId:'free',ratio:['3:4','4:3','16:9'][i],width:w,height:h,mime:'image/svg+xml',source:'ai',prompt:'fixture',version:1,selected:false,createdAt:stamp,updatedAt:stamp}));
const base={data:{assets,drafts:[],topics:[],contents:[],contentWriteReady:true,generationReady:true,storageReady:true,generationMessage:''},sessions:[{id:a,title:'测试：技术档案封面',archived:false,updatedAt:stamp,running:false},{id:b,title:'测试：横版文章配图',archived:false,updatedAt:'2026-10-22T14:00:00Z',running:false}],turns:[{id:'fixture-turn-a',sessionId:a,input:'FIXTURE 隔离测试\\n做一张技术档案风的图片，保留原图。',output:'已生成图片，可以继续告诉我需要修改哪里。',status:'success',error:null,assetIds:['fixture-0'],ratio:'3:4',skillName:'doudou-editorial-cover'},{id:'fixture-turn-b',sessionId:b,input:'FIXTURE：用于文章的横版配图',output:'已生成横版图片。',status:'success',error:null,assetIds:['fixture-1','fixture-2'],ratio:'4:3',skillName:null}]};
window.__state=JSON.parse(localStorage.getItem(key)||'null')||base;window.__calls=[];window.__hold=false;
const save=()=>localStorage.setItem(key,JSON.stringify(window.__state));
const skills=[{id:'fixture-editorial',name:'doudou-editorial-cover',description:'测试技能'},{id:'fixture-image2',name:'video-cover-image2',description:'测试技能2'}];
window.__request=async(url,init)=>{
 if(url==='/api/images')return structuredClone(window.__state.data);
 if(url==='/api/images/chat/sessions'){
  if(init?.method==='POST'){const body=JSON.parse(init.body);window.__calls.push(body);let s=window.__state.sessions.find(s=>s.id===body.id);if(body.action==='create'){s={id:body.id,title:'新对话',archived:false,updatedAt:new Date().toISOString(),running:false};window.__state.sessions.unshift(s);}else if(body.action==='rename')s.title=body.title;else s.archived=body.action==='archive';save();return structuredClone(s);}
  return {sessions:structuredClone(window.__state.sessions)};
 }
 if(url.startsWith('/api/images/chat?session=')){const result={turns:structuredClone(window.__state.turns.filter(t=>t.sessionId===url.split('=')[1])),skills};if(window.__delayHistory)await new Promise(r=>setTimeout(r,1000));return result;}
 throw Error('Fixture request blocked: '+url);
};
window.fetch=async(url,init)=>{
 if(url!=='/api/images/chat'||init?.method!=='POST')throw Error('Fixture network blocked');
 const body=JSON.parse(init.body);window.__calls.push(body);let session=window.__state.sessions.find(s=>s.id===body.sessionId);
 if(!session){session={id:body.sessionId,title:body.text.split('\\n')[0],archived:false,updatedAt:new Date().toISOString()};window.__state.sessions.unshift(session);}session.running=true;
 const turn={id:body.id,sessionId:body.sessionId,input:body.text,output:'',status:'running',error:null,assetIds:[],ratio:body.ratio,skillName:skills.find(s=>s.id===body.skillId)?.name??null};window.__state.turns.push(turn);save();
 return new Response(new ReadableStream({start(controller){const finish=()=>{turn.output='FIXTURE 回复：只属于发送时的对话。';turn.status='success';turn.assetIds=['fixture-2'];session.running=false;save();controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'done',turn})+'\\n'));controller.close();};window.__finish=finish;if(!window.__hold)setTimeout(finish,1200);}}),{headers:{'Content-Type':'application/x-ndjson'}});
};
createRoot(document.getElementById('root')).render(<CreationShell step="materials" content={null} query="step=materials" date="2026-10-23" syncWindow="10:30"><ImagesPage config={config} initialData={window.__state.data} today="2026-10-23" syncWindow="10:30" initialTopic={null}/></CreationShell>);`;
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
                ? `export const useSearchParams=()=>new URLSearchParams('step=materials');export const usePathname=()=>'/create';export const useRouter=()=>({push(){},replace(){},refresh(){}});`
                : readFileSync('src/ui/use-resource.ts', 'utf8')
                    .replace(
                      "import { visibleRecords } from './visible-records.ts';",
                      'const visibleRecords=<T,>(data:T):T=>data;',
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
const css = ['tokens', 'workspace', 'images'].map((n) => readFileSync(`src/ui/${n}.css`, 'utf8')).join('\n');
writeFileSync(
  out + '/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>生图对话 · 隔离测试</title><style>*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
