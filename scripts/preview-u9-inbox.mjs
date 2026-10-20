// Actual UI components with explicitly marked in-memory fixtures; no platform or database writes.
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parse } from 'yaml';
const root = process.cwd(),
  out = 'docs/verification/u9/a';
mkdirSync(out, { recursive: true });
const yaml = (n) => parse(readFileSync(`config/${n}.yaml`, 'utf8'));
const runtime = `
import React from 'react';import{createRoot}from'react-dom/client';import Inbox from './src/app/inbox/inbox-page';
const item={fixture:true,id:'fixture-u9-message',revision:0,platformId:'douyin',channel:'comment',author:'测试用户',body:'这是一条测试消息，想知道如何把素材变成可复用的作品流程？',sentAt:'2026-10-20T01:00:00Z',capturedAt:'2026-10-20T02:00:00Z',sourceUrl:null,contentId:null,contentTitle:'测试作品',classification:{status:'ready',result:{category:'idea',reason:'fixture'}},reply:{kind:'comment',ownReplyFound:false,repliesComplete:true},context:[],contextComplete:true,dealId:null,dealSync:'synced',dealSyncReason:null,topicSignalId:null,topicSyncedAt:null};
window.__data={items:[item],themes:[],sources:[],recordsReady:true,topicSyncReady:false,message:''};window.fetch=()=>Promise.reject(Error('No network in fixture harness'));window.open=()=>{window.__opened=true;return {opener:null}};Object.defineProperty(navigator,'clipboard',{value:{writeText:async(text)=>{window.__copied=text}}});
window.__handle=async(url,init)=>{const input=JSON.parse(init.body);const m=window.__data.items[0];if(input.expectedActionId!==(m.manualActionId??null))throw Error('stale fixture');const next={...m,manualDisposition:input.action==='undo'?null:input.action,manualActionId:crypto.randomUUID()};window.__data={...window.__data,items:[next]};return{item:next};};
window.__newMessage=()=>{window.__data={...window.__data,items:[{...window.__data.items[0],manualDisposition:null,newReply:true}]};window.dispatchEvent(new Event('fixture-refresh'))};
createRoot(document.getElementById('root')).render(<Inbox config={${JSON.stringify(yaml('inbox'))}} platforms={${JSON.stringify(yaml('platforms').platforms)}} destinations={{douyin:{comment:'about:blank'}}} initialData={window.__data} initialMessageId={null} initialPriority today="2026-10-20" syncWindow="10:30–10:45"/>);
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
      name: 'fixture',
      setup(b) {
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          loader: 'tsx',
          resolveDir: root,
          contents:
            a.path === 'link'
              ? `import React from'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`
              : `import{useState,useEffect}from'react';export const request=(...a)=>window.__handle(...a);export function useResource(){const[data,setData]=useState(window.__data);const refresh=async()=>setData(window.__data);useEffect(()=>{window.addEventListener('inbox-handled',refresh);window.addEventListener('fixture-refresh',refresh);return()=>{window.removeEventListener('inbox-handled',refresh);window.removeEventListener('fixture-refresh',refresh)}},[]);return{data,error:'',refresh}}`,
        }));
      },
    },
  ],
});
const css =
  ['tokens', 'workspace', 'inbox', 'deals'].map((n) => readFileSync(`src/ui/${n}.css`, 'utf8')).join('\n') +
  '.undo-toast' +
  readFileSync('src/app/globals.css', 'utf8').split('.undo-toast')[1];
writeFileSync(
  `${out}/fixture-preview.html`,
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>U9 消息隔离测试</title><style>*{box-sizing:border-box}body{margin:0}button,input,select{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css.replace(/\n \{/g, '\n.undo-toast {') +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
