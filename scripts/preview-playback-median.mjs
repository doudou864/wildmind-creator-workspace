// Isolated fixture preview of the actual page; no database access or platform requests.
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';
const root = process.cwd();
const runtime = `
import React from 'react';import {createRoot} from 'react-dom/client';
import Page from './src/app/data-center/data-center-page';
import {playbackDistribution} from './src/core/data-center';
const titles=['测试样本：AI工具的实际体验','测试样本：为什么提示词越长效果越差','测试样本：用自动化处理重复任务','测试样本：这是一条需要斜向显示的很长作品标题','测试样本：零播放记录','测试样本：缺少当天记录'];
const posts=titles.map((title,i)=>({id:'fixture-'+i,title,platformId:'douyin',form:'视频',publishedAt:'2026-09-01T23:55:00+08:00',metricId:'views',fire:null}));
const samples=[1,3,7].flatMap(day=>posts.slice(0,5).map((p,i)=>({id:p.id+'-'+day,postId:p.id,metricId:'views',capturedAt:new Date(Date.parse('2026-09-01T10:00:00+08:00')+day*86400000).toISOString(),value:i===4?0:(i+1)*2000*day,backfillKind:'none'})));
const playback=Object.fromEntries([1,3,7,30].map(day=>[day,playbackDistribution(posts[0],posts,samples,day,Date.parse('2026-10-21'),{timeZone:'Asia/Shanghai',axisPadding:1000})]));
const data={posts,selected:posts[0],age:50,minimum:5,hitThreshold:2,ratio:null,ratioDay:null,endDay:21,checkpoints:[1,3,7,21],curve:[],playbackDays:[1,3,7,30],playback,comparisons:{},fingerprints:{},interpretations:[]};
window.fetch=()=>Promise.reject(Error('Fixture preview blocks requests'));
createRoot(document.getElementById('root')).render(<Page data={data} embedded metricPresentation={${JSON.stringify(parse(readFileSync('config/data-center.yaml', 'utf8')).presentation)}} rawReadings={{}} readings={{}} today="2026-10-21" syncWindow=""/>);
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
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({ path: a.path, namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          loader: 'tsx',
          resolveDir: root,
          contents:
            a.path === 'next/link'
              ? `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`
              : `export const usePathname=()=>'/data-center';export const useRouter=()=>({refresh(){},push(){}});`,
        }));
      },
    },
  ],
});
const css = ['tokens', 'workspace', 'data-center'].map((n) => readFileSync('src/ui/' + n + '.css', 'utf8')).join('\n');
writeFileSync(
  '/tmp/wildmind-playback-fixture.html',
  '<!doctype html><meta charset="utf-8"><title>隔离测试：作品播放中位数</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:var(--bg)}button{font:inherit}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script>',
);
console.log('/tmp/wildmind-playback-fixture.html');
