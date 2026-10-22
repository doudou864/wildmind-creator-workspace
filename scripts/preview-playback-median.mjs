// Isolated fixture preview of the actual page; no database access or platform requests.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
const root = process.cwd();
const runtime = `
import React from 'react';import {createRoot} from 'react-dom/client';
import Page from './src/app/works/page';
import {playbackDistribution} from './src/core/data-center';
const titles=['测试样本：AI工具的实际体验','测试样本：为什么提示词越长效果越差','测试样本：用自动化处理重复任务','测试样本：这是一条需要斜向显示的很长作品标题','测试样本：零播放记录','测试样本：缺少当天记录'];
const posts=titles.map((title,i)=>({id:'fixture-'+i,title,platformId:'douyin',form:'视频',publishedAt:'2026-09-01T23:55:00+08:00',metricId:'views',fire:null}));
const sparse=new URLSearchParams(location.search).has('sparse');
const samples=(sparse?[3,7]:[1,3,7]).flatMap(day=>(sparse?posts.slice(day===7?4:1,day===7?5:3):posts.slice(0,5)).map((p,i)=>({id:p.id+'-'+day,postId:p.id,metricId:'views',capturedAt:new Date(Date.parse('2026-09-01T10:00:00+08:00')+day*86400000).toISOString(),value:sparse?(day===7?2875:(i+1)*1500):i===4?0:(i+1)*2000*day,backfillKind:'none'})));
const playback=Object.fromEntries([1,3,7,30].map(day=>[day,playbackDistribution('douyin',posts,samples,day,Date.parse('2026-10-21'),{timeZone:'Asia/Shanghai',axisPadding:1000})]));
const data={posts,selected:posts[0],age:50,minimum:5,hitThreshold:2,ratio:null,ratioDay:null,endDay:21,checkpoints:[1,3,7,21],curve:[],comparisons:{},fingerprints:{},interpretations:[]};
window.fetch=()=>Promise.reject(Error('Fixture preview blocks requests'));
window.__worksFixture={posts:posts.map(p=>({...p,contentId:p.id})),contents:posts.map(p=>({id:p.id,title:p.title,form:p.form,videoCovers:{},updatedAt:p.publishedAt})),samples:[],data,playback:{platformName:'抖音',days:[1,3,7,30],minimum:5,distributions:playback},config:{platforms:[{id:'douyin',name:'抖音'},{id:'bilibili',name:'B站'}],parameters:{syncWindow:''}},settings:{platformId:'douyin',presentation:${JSON.stringify(parse(readFileSync('config/data-center.yaml', 'utf8')).presentation)}}};
const fixture=window.__worksFixture;
fixture.posts.push({...fixture.posts[0],id:'fixture-external',platformId:'bilibili'});
const root=createRoot(document.getElementById('root'));
window.__renderWorks=async query=>root.render(await Page({searchParams:Promise.resolve(query)}));
window.__renderWorks({});
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
      name: 'fixture-next',
      setup(b) {
        const stubs = {
          '@/browser/policy': `export const shanghaiDate=()=> '2026-10-22';`,
          'next/link': `import React from 'react';export default function Link({children,href,...props}){return <a {...props} href={href} onClick={e=>{e.preventDefault();window.__renderWorks(Object.fromEntries(new URL(href,'http://fixture').searchParams));}}>{children}</a>}`,
          'next/navigation': `export const usePathname=()=>'/works';export const useRouter=()=>({refresh(){},push(){}});export const notFound=()=>{throw Error('not found')};`,
          '@/lib/config': `export const loadConfig=async()=>window.__worksFixture.config;`,
          '@/lib/data-center-config': `export const loadDataCenterConfig=async()=>window.__worksFixture.settings;`,
          '@/lib/media-store': `export const usingDatabase=async cb=>cb({db:{select:()=>({from:table=>({all:()=>window.__worksFixture[table]})})}});`,
          '@/db/schema': `export const contents='contents',posts='posts',postSnapshots='samples';`,
          '@/lib/record-archives': `export const withArchives=(_,data)=>data;`,
          '@/ui/archive-controls': `import React from 'react';export const ArchiveButton=()=> <span>隔离测试：归档不可用</span>;`,
          '@/lib/data-center-store': `export const worksPlaybackData=()=>window.__worksFixture.playback;export const dataCenterData=(_,__,___,id)=>({...window.__worksFixture.data,selected:window.__worksFixture.data.posts.find(p=>p.id===id)});`,
          '@/ui/analysis-read': `export const analysisRead=()=>({});`,
          '@/ui/dashboard-read': `export const dashboardRead=()=>({readings:{}});`,
        };
        b.onResolve({ filter: /.*/ }, (a) => (stubs[a.path] ? { path: a.path, namespace: 'fixture' } : undefined));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          loader: 'tsx',
          resolveDir: root,
          contents: stubs[a.path],
        }));
      },
    },
  ],
});
const css = ['tokens', 'workspace', 'data-center'].map((n) => readFileSync('src/ui/' + n + '.css', 'utf8')).join('\n');
writeFileSync(
  '/tmp/wildmind-playback-fixture.html',
  '<!doctype html><meta charset="utf-8"><title>隔离测试：作品播放中位数</title><style>*{box-sizing:border-box}body{margin:0;padding:0;background:var(--bg)}button{font:inherit}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script>',
);
console.log('/tmp/wildmind-playback-fixture.html');
