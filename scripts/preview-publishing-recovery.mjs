// Isolated UI acceptance. Requests are mocked in memory; platform/network writes are disabled.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'docs/verification/publishing-recovery';
mkdirSync(out, { recursive: true });
const runtime = `
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PublishingTasks} from './src/ui/publishing-tasks';
const stamp=new Date().toISOString();
const batch={id:'fixture-recovery',fixture:true,revision:0,createdAt:stamp,state:'running',draft:{commonCopy:{title:'隔离测试：浏览器关闭后的上传恢复'},settings:[]}};
window.__calls=[];
window.__data={batches:[batch],receipts:[],tasks:[{batchId:batch.id,token:'fixture',operation:'upload',status:'interrupted',checkpoint:'小红书 · 填写主题和话题',reason:'原浏览器工作区已关闭；材料已保留',browser:{spaceId:999,name:'fixture'},process:null,updatedAt:stamp}]};
window.fetch=()=>Promise.reject(Error('隔离测试禁止网络'));
window.__request=async(url,init)=>{
 const body=JSON.parse(init.body); window.__calls.push({url,...body});
 if(body.action==='resume')throw Error('原浏览器已关闭，请点击“重建浏览器并继续上传”；填写的材料仍保留。');
 if(body.action!=='rebuild-upload')throw Error('本验收只支持重建');
 if(body.expectedRevision!==window.__data.batches[0].revision)throw Error('版本不符');
 window.__data.tasks[0]={...window.__data.tasks[0],status:'running',browser:null,reason:null,checkpoint:'重建浏览器，重新准备上传'};
 window.__data.batches[0].revision++;
 return structuredClone(window.__data.tasks[0]);
};
function App(){const[data,setData]=useState(structuredClone(window.__data));return <main className="workspace publishing-workspace"><h1>发布任务恢复 · 隔离验收</h1><p>所有任务和请求均为隔离测试，不上传或发布真实作品。</p><PublishingTasks data={data} selectedId={batch.id} onNew={()=>{}} onSelect={()=>{}} onDeleted={()=>{}} onRefresh={async()=>setData(structuredClone(window.__data))}/></main>}
createRoot(document.getElementById('root')).render(<App/>);`;
const result = await build({
  stdin: { contents: runtime, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true,
  write: false,
  jsx: 'automatic',
  plugins: [
    {
      name: 'fixture-request',
      setup(build) {
        build.onLoad({ filter: /use-resource\.ts$/ }, () => ({
          loader: 'ts',
          contents: 'export async function request(...args:any[]){return window.__request(...args)}',
        }));
      },
    },
  ],
});
const css = ['tokens', 'workspace', 'publishing'].map((name) => readFileSync(`src/ui/${name}.css`, 'utf8')).join('\n');
writeFileSync(
  out + '/fixture-preview.html',
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>发布恢复隔离验收</title><style>*{box-sizing:border-box}body{margin:0}button{font:inherit}${css}</style><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></html>`,
);
