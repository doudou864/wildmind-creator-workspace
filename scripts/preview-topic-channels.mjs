// Isolated preview: no filesystem discovery, network, database or platform writes.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const runtime = `import React from 'react';import{createRoot}from'react-dom/client';import{TopicChannelEditor}from'./src/ui/topic-channel-editor';
window.__data={channels:[],revision:'0'};window.__requests=[];window.__request=async(url,init)=>{window.__requests.push({url,method:init?.method??'GET'});if(init?.method==='POST'){const e=JSON.parse(init.body);if(e.revision!==window.__data.revision)throw Error('fixture revision');let rows=window.__data.channels;if(e.action==='add')rows=[...rows,{id:'fixture-channel',kind:'external',enabled:true,name:e.title,location:e.link}];if(e.action==='edit')rows=rows.map(c=>c.id===e.id?{...c,name:e.title,location:e.link}:c);if(e.action==='remove')rows=rows.filter(c=>c.id!==e.id);window.__data={channels:rows,revision:String(Number(window.__data.revision)+1)}}return window.__data;};
createRoot(document.getElementById('root')).render(<main className="workspace"><h1>选题中心</h1><TopicChannelEditor onChanged={channels=>window.__changed=channels}/><section className="card"><h2>候选方向</h2><p>候选用完了</p></section></main>);`;
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
          contents: 'export const request=(...args)=>window.__request(...args);',
          loader: 'js',
        }));
      },
    },
  ],
});
const css = ['tokens', 'workspace', 'topics'].map((n) => readFileSync(`src/ui/${n}.css`, 'utf8')).join('\n');
writeFileSync(
  'docs/verification/topic-channels/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>渠道编辑隔离测试</title><style>*{box-sizing:border-box}body{margin:0}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
