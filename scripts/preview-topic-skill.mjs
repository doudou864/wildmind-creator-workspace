// Isolated UI fixture: no production API, Skill or candidates are changed.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../src/lib/config.ts';
import { readTopicSkill } from '../src/lib/topic-skill.ts';
const config = await loadConfig();
const skill = await readTopicSkill();
const runtime = `import React from 'react';import{createRoot}from'react-dom/client';import TopicsPage from './src/app/topics/topics-page';
const key='topic-skill-isolated-fixture';
const empty={skill:${JSON.stringify(skill)},task:null};
const read=()=>JSON.parse(localStorage.getItem(key)||JSON.stringify(empty));
const write=v=>localStorage.setItem(key,JSON.stringify(v));
window.__request=async(url,init)=>{
 const state=read();
 if(url==='/api/topics/skill'&&init?.method==='PUT'){
  const edit=JSON.parse(init.body);if(edit.revision!==state.skill.revision)throw Error('Skill 已在另一处修改；你的文字已保留，请重新读取后合并');
  state.skill.files.find(f=>f.id===edit.id).content=edit.content;state.skill.revision='fixture-'+Date.now();write(state);return state.skill;
 }
 if(url==='/api/topics/skill')return state.skill;
 if(url==='/api/topics/generate'&&init?.method==='POST'){
  if(state.task?.status==='running')return {started:false,task:state.task};
  state.task={id:'fixture-job',pid:1,status:'running',stage:'researching',activity:'正在按 Skill 寻找实体',skillRevision:JSON.parse(init.body).revision,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),reason:null,warning:null,count:0,sourceCount:0,cachedCount:0,currentSource:'',sources:[]};write(state);return {started:true,task:state.task};
 }
 if(url==='/api/topics/generate')return {task:state.task};
 if(url==='/api/topics')return {topics:[{id:'fixture-topic',title:'【隔离测试】找文件的时间，能不能还给真正要做的事？',direction:'【隔离测试】一个虚构的文件整理原型，把重复的命名和归档操作合并成一次确认；目前只有演示，没有商业使用数据。',channelId:'topic_skill',signal:'虚构测试资料',sourceContext:'隔离测试',sourceUrl:'https://example.org/fixture',exploration:false,evidence:null,status:'candidate',frozenFire:null,frozenEvidence:null,selectedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),automatic:false}],d21Samples:0,generationReady:true,writeReady:true,serviceMessage:'隔离测试',generation:state.task};
 return {};
};
window.fixtureConflict=()=>{const s=read();s.skill.revision='fixture-external';write(s)};
window.fixtureComplete=()=>{const s=read();s.task.status='completed';s.task.stage='finished';s.task.count=1;write(s)};
createRoot(document.getElementById('root')).render(<TopicsPage parameters={${JSON.stringify({ ...config.parameters, topicPollMs: 1000 })}} platforms={${JSON.stringify(config.platforms)}} initialData={{topics:[],d21Samples:0,generationReady:true,writeReady:true,serviceMessage:'fixture',generation:read().task}} today="2026-10-30"/>);`;
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
        b.onResolve({ filter: /next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
        b.onResolve({ filter: /workspace-header$/ }, () => ({ path: 'header', namespace: 'fixture' }));
        b.onResolve({ filter: /archive-controls$/ }, () => ({ path: 'archive', namespace: 'fixture' }));
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents:
            args.path === 'link'
              ? "import React from 'react';export default function Link(p){return <a {...p}/>}"
              : args.path === 'header'
                ? "import React from 'react';export function WorkspaceHeader(){return <header style={{padding:'16px 0'}}>隔离测试 · 选题 / 素材 / 排版 / 发布检查</header>}"
                : args.path === 'archive'
                  ? 'export function ArchiveButton(){return null}'
                  : readFileSync('src/ui/use-resource.ts', 'utf8')
                      .replace('./visible-records.ts', process.cwd() + '/src/ui/visible-records.ts')
                      .replace(
                        /export async function request<T>[\s\S]*?export function useResource/,
                        'export async function request<T>(...args:any[]):Promise<T>{return window.__request(...args)}\nexport function useResource',
                      ),
        }));
      },
    },
  ],
});
mkdirSync('data/topic-skill-preview', { recursive: true });
const css = ['tokens', 'workspace', 'topics'].map((n) => readFileSync('src/ui/' + n + '.css', 'utf8')).join('\n');
writeFileSync(
  'data/topic-skill-preview/fixture-preview.html',
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>选题 Skill 隔离验收</title><style>*{box-sizing:border-box}body{margin:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
    css +
    '</style><div id="root"></div><script>' +
    result.outputFiles[0].text.replaceAll('</script', '<\\/script') +
    '</script></html>',
);
