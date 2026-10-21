// Isolated preview: no filesystem discovery, network, database or platform writes.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const runtime = `import React from 'react';import{createRoot}from'react-dom/client';import{LocalVideoPicker}from'./src/ui/local-video-picker';
window.__requests=[];window.__request=async(url,init)=>{window.__requests.push({url,...init});return{video:{id:'fixture-video'}}};
createRoot(document.getElementById('root')).render(<main className="workspace"><h1>准备发布</h1><section className="card"><h2>测试作品 · 成片</h2><LocalVideoPicker contentId="fixture-work" disabled={false} onSelected={id=>{document.getElementById('result').textContent='已读取测试视频';window.__selected=id}}/><p id="result" role="status"/></section></main>);`;
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
const css = ['tokens', 'workspace', 'publishing'].map((n) => readFileSync(`src/ui/${n}.css`, 'utf8')).join('\n');
writeFileSync(
  'docs/verification/video-path/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>指定路径测试</title><style>*{box-sizing:border-box}body{margin:0}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
