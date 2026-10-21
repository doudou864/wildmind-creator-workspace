// Isolated preview: no filesystem discovery, network, database or platform writes.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const runtime = `import React from 'react';import{createRoot}from'react-dom/client';import{CollectionStrip}from'./src/ui/collection-strip';
window.__requests=[];window.__running=true;window.__active=['douyin','bilibili'];
window.__request=async(url,init)=>{const body=JSON.parse(init.body);window.__requests.push(body);if(body.action==='stop'){for(const p of platforms)if(window.__active.includes(p.id)&&(!body.platform||p.id===body.platform)){p.status='failed';p.reason='已停止本次采集';}window.__active=body.platform?window.__active.filter(id=>id!==body.platform):[];window.__running=window.__active.length>0;return {stopping:body.platform?[body.platform]:['douyin','bilibili']}};window.__active=[...new Set([...window.__active,body.platform??'douyin'])];window.__running=true;return{started:true,startedPlatforms:[body.platform??'douyin'],skippedPlatforms:[],errors:[]}};
const platforms=[{id:'douyin',name:'抖音',status:'success',lastSuccess:'2026-10-21T03:00:00Z'},{id:'xiaohongshu',name:'小红书',status:'failed',reason:'测试：需要登录',lastSuccess:'2026-10-20T03:00:00Z'},{id:'bilibili',name:'B站',status:'success',lastSuccess:'2026-10-21T03:00:00Z'},{id:'channels',name:'视频号',status:'pending',lastSuccess:null},{id:'youtube',name:'YouTube',status:'success',lastSuccess:'2026-10-21T03:00:00Z'}];
createRoot(document.getElementById('root')).render(<main className="workspace"><h1>总控台</h1><CollectionStrip platforms={platforms} today="2026-10-21" onUpdate={()=>{}}/></main>);`;
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
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
          contents: `import {useState,useCallback} from 'react';export const request=(...args)=>window.__request(...args);export function useResource(){const [data,setData]=useState({running:true,activePlatforms:window.__active,issue:null});const refresh=useCallback(async()=>setData({running:window.__running,activePlatforms:window.__active,issue:null}),[]);return{data,error:'',refresh}}`,
          loader: 'js',
          resolveDir: process.cwd(),
        }));
      },
    },
  ],
});
const css = ['tokens', 'workspace', 'topics'].map((n) => readFileSync(`src/ui/${n}.css`, 'utf8')).join('\n');
writeFileSync(
  'docs/verification/collection-speed-stop/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>采集状态隔离测试</title><style>*{box-sizing:border-box}body{margin:0}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
