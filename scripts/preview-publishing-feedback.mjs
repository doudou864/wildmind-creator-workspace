// Isolated UI fixtures: no platform actions or real records.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const out = 'docs/verification/publishing-feedback';
mkdirSync(out, { recursive: true });
const runtime = `
import React from 'react';import {createRoot} from 'react-dom/client';import {PublishingTasks} from './src/ui/publishing-tasks';
const platformNames={douyin:'抖音',xiaohongshu:'小红书',bilibili:'B站',channels:'视频号',youtube:'YouTube'};
const batch={id:'fixture-feedback',fixture:true,revision:0,createdAt:new Date().toISOString(),state:'prepared',draft:{commonCopy:{title:'隔离测试：五平台发布结果'},settings:Object.keys(platformNames).map(platformId=>({platformId}))}};
const statuses=['published','unknown','published','pending_review','unknown'];const reasons=['已在作品管理确认发布成功','登录失效，请先登录后继续核验','稿件已发布','已提交，平台审核中','账号未核实，尚未点击发布'];
const data={batches:[batch],receipts:Object.keys(platformNames).map((platformId,i)=>({id:platformId,batchId:batch.id,platformId,status:statuses[i],reason:reasons[i],failureStage:i===4?'publish':null})),tasks:[{batchId:batch.id,status:'attention',operation:'upload',checkpoint:'本轮核验结束',process:null,reason:null}]};
window.fetch=()=>Promise.reject(Error('隔离验收禁止网络'));
createRoot(document.getElementById('root')).render(<main className="workspace publishing-workspace"><h1>发布中心 · 隔离验收</h1><PublishingTasks data={data} platformNames={platformNames} selectedId={batch.id} onNew={()=>{}} onSelect={()=>{}} onDeleted={()=>{}} onRefresh={async()=>{}}/></main>);`;
const result = await build({
  stdin: { contents: runtime, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true,
  write: false,
  jsx: 'automatic',
});
const css = ['tokens', 'workspace', 'publishing'].map((n) => readFileSync(`src/ui/${n}.css`, 'utf8')).join('\n');
writeFileSync(
  out + '/fixture-preview.html',
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>发布结果隔离验收</title><style>*{box-sizing:border-box}body{margin:0}button{font:inherit}${css}</style><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></html>`,
);
