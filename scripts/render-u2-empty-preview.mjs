// Isolated QA rendering of the actual dashboard component; never writes database data.
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = process.cwd();
mkdirSync('data/verification', { recursive: true });
await build({
  stdin: {
    resolveDir: root,
    loader: 'tsx',
    contents: `
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {AppRouterContext} from 'next/dist/shared/lib/app-router-context.shared-runtime.js';
import {loadConfig} from './src/lib/config';
import {loadDealConfig} from './src/lib/deal-config';
import {loadInboxConfig} from './src/lib/inbox-config';
import Dashboard from './src/app/dashboard';
import {readFileSync,writeFileSync} from 'node:fs';
async function main(){
 const config=await loadConfig(),dealConfig=await loadDealConfig(),inbox=await loadInboxConfig();
 const raw=await (await fetch('http://127.0.0.1:3000/api/dashboard')).json();
 const data={...raw,attention:[],accountAlerts:[],themes:[],plannedContents:[],questions:[],platforms:Object.fromEntries(Object.entries(raw.platforms).map(([id,p]:any)=>[id,{...p,status:'success',lastSuccess:'2026-10-20T03:00:00Z',error:null,days:[],works:[]}]))};
 const deals={items:[],messages:[],recordsReady:true,writeReady:true,suggestionReady:false,message:''};
 const css=['tokens','workspace'].map(n=>readFileSync('src/ui/'+n+'.css','utf8')).join('\\n');
 const html=renderToStaticMarkup(<AppRouterContext.Provider value={{push(){},refresh(){}} as any}><Dashboard config={config} today="2026-10-20" initialData={data} initialDeals={deals} dealConfig={dealConfig} dealChannels={inbox.channels} dataCenterPlatformId="douyin" presentation={{readings:{},mature:{}}}/></AppRouterContext.Provider>);
 writeFileSync('docs/verification/u2/empty-preview.html','<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><title>U2 无待办验收样例</title><style>*{box-sizing:border-box}body{margin:0}button,a{font:inherit}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}'+css+'</style>'+html+'</html>');
}main();
`,
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
  outfile: 'data/verification/u2-empty.cjs',
});
execFileSync(process.execPath, ['data/verification/u2-empty.cjs'], { stdio: 'inherit' });
