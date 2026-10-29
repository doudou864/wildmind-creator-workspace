// Real client components with fixture-only browser persistence. No real DB or platform access.
// Run: node scripts/preview-video-workflow.mjs [--serve] [--port=4319]
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
const root = process.cwd();
const out = '/private/tmp/wildmind-video-ui-preview';
const yaml = (name) => parse(readFileSync(path.join(root, 'config', name + '.yaml'), 'utf8'));
const configs = {
  parameters: yaml('parameters'),
  platforms: yaml('platforms').platforms,
  metrics: yaml('metrics').metrics,
  images: yaml('image-styles'),
  publishing: yaml('publishing-templates'),
  layouts: yaml('layout-styles'),
  inbox: yaml('inbox'),
  deals: yaml('deals'),
};
mkdirSync(out, { recursive: true });
const runtime =
  `const configs=${JSON.stringify(configs)};` +
  String.raw`
import React, {useSyncExternalStore} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from './src/app/dashboard';
import Topics from './src/app/topics/topics-page';
import Images from './src/app/images/images-page';
import Publishing from './src/app/publishing/publishing-page';
import Inbox from './src/app/inbox/inbox-page';
import {WorkspaceHeader} from './src/ui/workspace-header';
import {WorkPageHeader} from './src/ui/work-page-header';
import {WorksPlaybackCard} from './src/ui/works-playback-card';
import {newPublishDraft,publishDraftSchema,platformMaterialKey} from './src/lib/publishing-model';
import {applyTopicDecision} from './src/lib/topic-model';
const today='2026-10-30',stamp='2026-10-30T02:00:00Z';
const scenario=new URLSearchParams(location.search).get('scenario')||sessionStorage.getItem('video-fixture-scenario')||'default';
sessionStorage.setItem('video-fixture-scenario',scenario);
const storeKey='wildmind-video-ui-fixture-v1:'+scenario;
const session='00000000-0000-4000-8000-000000000001';
const title='隔离测试：普通人如何用 AI 整理工作资料';
const topic={id:'fixture-topic',fixture:true,title,direction:'把零散素材变成下次还能找得到的资料',channelId:'fixture-source',signal:'测试原文',sourceContext:'FIXTURE：这是隔离测试材料，不是真实商业机会。',sourceUrl:'https://example.invalid/fixture',exploration:true,evidence:null,status:'candidate',frozenFire:null,frozenEvidence:null,selectedAt:null,automatic:false,createdAt:stamp,updatedAt:stamp};
const content={id:'fixture-content',fixture:true,title,form:'视频',topicId:topic.id,plannedDate:null,videoCovers:{},updatedAt:stamp};
const asset=(id,w,h,ratio)=>({id,fixture:true,familyId:id,title:'隔离测试封面 '+ratio,contentId:null,topicId:topic.id,purposeId:'video_cover',ratio,path:'fixture',width:w,height:h,mime:'image/svg+xml',source:'ai',prompt:'fixture',version:1,selected:false,createdAt:stamp,updatedAt:stamp});
const assets=[asset('fixture-portrait',750,1000,'3:4'),asset('fixture-landscape',1000,750,'4:3'),asset('fixture-wide',1600,900,'16:9'),asset('fixture-square',1000,1000,'1:1'),asset('fixture-portrait-old',750,1000,'3:4')];
const message={id:'fixture-message',fixture:true,revision:0,platformId:'douyin',channel:'comment',author:'测试观众',body:'这套方法适合整理几十段视频素材吗？希望你能具体演示一次。',sentAt:stamp,capturedAt:stamp,sourceUrl:null,contentId:content.id,platformPostId:'fixture-post',contentTitle:title,classification:{status:'ready',result:{category:'idea',reason:'fixture'}},reply:{kind:'comment',ownReplyFound:false,repliesComplete:true},context:[],contextComplete:true,dealId:null,dealSync:'synced',dealSyncReason:null,topicSignalId:null,topicSyncedAt:null};
const items=[message,{...message,id:'fixture-message-2',author:'另一位测试观众',body:'如果素材很长，应该先按日期还是按主题整理？'},{...message,id:'fixture-other-message',contentId:'fixture-other-content',platformPostId:'fixture-other-post',contentTitle:title,body:'同名不同作品的评论：精确筛选时不应出现。'},{...message,id:'fixture-archived-message',manualDisposition:'replied',manualActionId:'fixture-action',body:'这条已经回复的隔离消息只在归档范围出现。'},{...message,id:'fixture-low-message',classification:{status:'ready',result:{category:'other',reason:'fixture'}},body:'路过。'}];
const topicTask={id:'fixture-topic-task',fixture:true,status:'completed',stage:'finished',currentSource:'',pid:0,createdAt:stamp,updatedAt:stamp,sourceCount:6,cachedCount:2,count:3,warning:null,reason:null,sources:[{id:'fixture-source',name:'隔离来源',url:'https://example.invalid/fixture',status:'completed',count:6,reason:null},{id:'fixture-blocked',name:'未读取来源',url:'https://example.invalid/blocked',status:'failed',count:0,reason:'测试：本轮来源暂时无法读取'}]};
const videoDraft={...newPublishDraft('video'),contentId:content.id,commonCopy:{title:'隔离测试：已有草稿，带入图片不能覆盖主题',description:'',tags:['AI','fixture-ui']},videoInput:{topicId:topic.id,path:'/fixture/video.mp4',covers:{'3:4':'fixture-portrait-old'}},settings:[{platformId:'douyin',title,description:'',tags:['AI'],scheduleAt:null,individuallyEdited:false}]};
const batch={id:'fixture-draft',fixture:true,revision:0,state:'draft',draft:videoDraft,createdAt:stamp};
const finished={...batch,id:'fixture-finished',state:'finished',draft:{...videoDraft,commonCopy:{...videoDraft.commonCopy,title:'隔离测试：五个平台的不同发布结果'},settings:configs.platforms.filter(p=>p.active).map(p=>({...videoDraft.settings[0],platformId:p.id}))},createdAt:'2026-10-29T02:00:00Z'};
const legacy={...batch,id:'fixture-legacy',draft:{...newPublishDraft('xhs'),commonCopy:{title:'隔离测试：旧图文历史',description:'',tags:[]},settings:[]}};
const statuses=['published','failed','pending_review','unknown','ready'];
const receipts=finished.draft.settings.map((setting,i)=>({id:'fixture-receipt-'+i,fixture:true,revision:0,batchId:finished.id,platformId:setting.platformId,status:statuses[i%statuses.length],reason: i===1?'测试：上传失败，可重试':i===3?'测试：结果待核对':null,failureStage:i===1?'upload':null,title:finished.draft.commonCopy.title,screenshotAssetId:'fixture-wide',uploadedAt:stamp,publishedAt:i===0?stamp:null,platformPostId:i===0?'fixture-post':null,url:null,safeToRetry:false,materials:''}));
const base={topics:[topic,{...topic,id:'fixture-topic-2',title:'隔离测试：一次把五个平台的封面准备齐',status:'selected',selectedAt:stamp},{...topic,id:'fixture-topic-3',title:'隔离测试：这是一条很长的选题，验证标题超过一行后仍然能看清内容并找到想看与无感操作'}],contents:[content,{...content,id:'fixture-other-content'}],assets,batches:[batch,finished,legacy],receipts,items,topicTask,sessions:[{id:session,fixture:true,title:'隔离测试：已有封面对话',archived:false,updatedAt:stamp,running:false}],turns:[{id:'fixture-turn',sessionId:session,input:'隔离测试：请生成三种尺寸的视频封面。',output:'这是供界面验收使用的几何测试图。',status:'success',error:null,assetIds:assets.slice(0,4).map(a=>a.id),ratio:'16:9',skillName:'隔离封面技能'}],channels:[{id:'fixture-source',name:'隔离来源',location:'https://example.invalid/fixture',kind:'external'}],running:[]};
if(scenario==='empty')Object.assign(base,{topics:[],contents:[],assets:[],batches:[],receipts:[],items:[],sessions:[],turns:[],topicTask:null});
if(scenario==='running')Object.assign(base,{running:['douyin'],topicTask:{...topicTask,status:'running',stage:'collecting',currentSource:'隔离来源',reason:null}});
if(scenario==='errors')base.topicTask={...topicTask,status:'failed',reason:'测试：本轮未生成候选，原有候选保留'};
window.__fixture=JSON.parse(localStorage.getItem(storeKey)||'null')||base;
window.__calls=[];window.__errors=[];window.__blocked=[];window.__failNext=false;window.__delay=0;
window.addEventListener('error',e=>window.__errors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.__errors.push(String(e.reason)));
const state=()=>window.__fixture,clone=v=>structuredClone(v),save=()=>localStorage.setItem(storeKey,JSON.stringify(state()));
window.__reset=()=>{localStorage.removeItem(storeKey);localStorage.removeItem('wildmind-image-conversations');sessionStorage.clear();location.assign('/');};
const skills=[{id:'fixture-skill',name:'隔离封面技能',description:'只用于测试'}];
const imageData=()=>({assets:state().assets,drafts:[],topics:state().topics,contents:state().contents,tasks:[],generations:[],pendingCrops:[],contentWriteReady:true,generationReady:true,storageReady:true,generationMessage:''});
const pubData=()=>({topics:state().topics.filter(t=>t.status==='selected'),contents:state().contents,assets:state().assets,videos:[],snapshots:[],batches:state().batches,receipts:state().receipts,tasks:[],accounts:configs.platforms.filter(p=>p.active).map(p=>({platformId:p.id,ready:true,reason:''})),recommendations:[],storageReady:true,aiReady:false,handoffReady:false,uploadReady:true,publishReady:true,uploadPlatforms:configs.platforms.filter(p=>p.active).map(p=>p.id),message:''});
const topicsData=()=>({topics:state().topics,generation:state().topicTask,d21Samples:0,generationReady:true,writeReady:true,serviceMessage:''});
const inboxData=()=>({items:state().items,themes:[],sources:[],recordsReady:true,topicSyncReady:true,message:''});
const dealData=()=>({items:[],messages:state().items,recordsReady:true,writeReady:true,suggestionReady:false,message:''});
const works=()=>state().contents.map((c,i)=>({id:i?'fixture-other-post':'fixture-post',title:c.title,form:c.form,published:'2026-10-27',checkpoints:{},state:'观察中'}));
const dashboardData=()=>({platforms:Object.fromEntries(configs.platforms.map((p,i)=>[p.id,{status:i===1?'failed':'success',lastSuccess:stamp,error:i===1?'测试：需要核对登录':null,...(i===2?{dataPending:{through:'2026-10-28',note:'测试：平台仅更新到前天'}}:{}),days:scenario==='empty'?[]:Array.from({length:7},(_,n)=>({date:'2026-10-'+String(n+23),values:{[p.metrics[0]]:420+n*75,followers:31000+n*10,net_followers:n===4?-5:10},precision:{}})),works:works(),baselines:{}}])),attention:[{id:'fixture-attention',platformId:'external_fixture',reason:'测试来源需要核对'}],hitRates:[],collectionReady:true,reviewReady:true,questions:[],questionsReady:true,plannedContents:[],plansReady:true,themes:[],themesReady:true,themeSyncReady:true,accountAlerts:[],accountAlertsReady:true});
const presentation={readings:Object.fromEntries(works().map((w,i)=>[w.id,{value:6800+i*2200,capturedAt:stamp,precision:'exact',name:'播放量',publishedAt:'2026-10-27'}])),mature:{douyin:0}};
function fail(url){window.__blocked.push(url);throw Error('隔离预览阻止未模拟请求：'+url);}
window.__request=async(raw,init={})=>{
 const url=new URL(raw,location.origin),p=url.pathname,method=init.method||'GET';
 window.__calls.push({url:raw,method,body:typeof init.body==='string'?JSON.parse(init.body):null});
 if(window.__delay)await new Promise(r=>setTimeout(r,window.__delay));
 if(window.__failNext){window.__failNext=false;throw Error('隔离测试：服务暂时无法连接，输入保留');}
 const body=typeof init.body==='string'?JSON.parse(init.body):{};
 if(p==='/api/images'&&method==='GET')return clone(imageData());
 if(p==='/api/publishing'&&method==='GET')return clone(pubData());
 if(p==='/api/topics'&&method==='GET')return clone(topicsData());
 if(p==='/api/inbox'&&method==='GET')return clone(inboxData());
 if(p==='/api/deals'&&method==='GET')return clone(dealData());
 if(p==='/api/dashboard'&&method==='GET')return clone(dashboardData());
 if(p==='/api/contents'&&method==='GET')return clone({items:state().contents,topics:state().topics,recordsReady:true,writeReady:true,message:''});
 if(p==='/api/archives')return {items:[]};
 if(p==='/api/topics/channels'){
  if(method!=='GET'){if(body.action==='remove')state().channels=state().channels.filter(c=>c.id!==body.id);else if(body.action==='edit'){const c=state().channels.find(c=>c.id===body.id);Object.assign(c,{name:body.title,location:body.link});}else state().channels.push({id:'fixture-source-'+crypto.randomUUID(),kind:'external',name:body.title,location:body.link});save();}
  return clone({channels:state().channels,revision:String(state().channels.length)});
 }
 if(p==='/api/topics/generate'){
  if(method==='POST'){state().topicTask={...topicTask,id:crypto.randomUUID(),status:'running',stage:'generating'};setTimeout(()=>{state().topicTask={...topicTask,id:state().topicTask.id};save();window.dispatchEvent(new Event('workspace-refresh'));},1000);save();}
  return clone({task:state().topicTask});
 }
 if(p.startsWith('/api/topics/')&&method==='PATCH'){
  const id=decodeURIComponent(p.split('/').at(-1));const t=state().topics.find(t=>t.id===id);if(!t)return fail(p);
  const next=applyTopicDecision(t,body.status,0,configs.parameters.topicFireMinimum,new Date().toISOString());state().topics=state().topics.map(t=>t.id===id?next:t);save();return clone(next);
 }
 if(p==='/api/images/chat/sessions'){
  if(method!=='GET'){let s=state().sessions.find(s=>s.id===body.id);if(body.action==='create'){if(s)return clone(s);s={id:body.id,fixture:true,title:body.title||'新对话',archived:false,running:false,updatedAt:stamp};state().sessions.unshift(s);}else if(s){if(body.action==='rename')s.title=body.title;else s.archived=body.action==='archive';}save();return clone(s);}
  return clone({sessions:state().sessions});
 }
 if(p==='/api/images/chat'&&method==='GET')return clone({turns:state().turns.filter(t=>t.sessionId===url.searchParams.get('session')),skills});
 if(p==='/api/collection'){
  if(method!=='GET'){state().running=body.action==='stop'?[]:body.platform?[body.platform]:configs.platforms.filter(p=>p.active).map(p=>p.id);save();}
  return clone({today,running:state().running.length>0,activePlatforms:state().running,issue:null,manualOnly:['channels'],startedPlatforms:state().running,skippedPlatforms:[],errors:[]});
 }
 if(p==='/api/collection/logs')return {runs:[],events:[]};
 if(/^\/api\/publishing\/drafts(?:\/[^/]+)?$/.test(p)&&['POST','PATCH'].includes(method)){
  const draft=publishDraftSchema.parse(body),id=decodeURIComponent(p.split('/')[4]||''),old=state().batches.find(b=>b.id===id);
  if(id&&!old)throw Error('隔离测试草稿不存在');
  if(old&&init.headers?.['If-Match']!==String(old.revision))throw Error('测试草稿已更新，请重新读取');
  draft.contentId||=old?.draft.contentId||'fixture-content-'+crypto.randomUUID();
  const next={id:old?.id||'fixture-batch-'+crypto.randomUUID(),fixture:true,revision:(old?.revision??-1)+1,state:'draft',draft,createdAt:old?.createdAt||new Date().toISOString()};
  state().batches=[...state().batches.filter(b=>b.id!==next.id),next];
  if(!state().contents.some(c=>c.id===draft.contentId))state().contents.push({...content,id:draft.contentId,title:draft.commonCopy.title,topicId:draft.videoInput?.topicId??null});
  save();return clone(next);
 }
 if(/^\/api\/publishing\/drafts\/[^/]+\/actions$/.test(p)){
  const b=state().batches.find(b=>b.id===p.split('/')[4]);if(!b)return fail(p);
  if(!['upload','upload-and-publish','publish-all'].includes(body.action))return fail(p);
  if(body.action!=='upload'&&!body.confirmed)throw Error('隔离测试：未明确确认');
  b.state=body.action==='upload'?'prepared':'finished';b.revision++;
  state().receipts=state().receipts.filter(r=>r.batchId!==b.id).concat(b.draft.settings.map((s,i)=>({...receipts[0],id:'fixture-new-receipt-'+i,batchId:b.id,platformId:s.platformId,status:body.action==='upload'?'ready':'pending_review',materials:platformMaterialKey(b.draft,s.platformId,pubData(),configs.publishing),reason:'隔离模拟回执，未操作真实平台'})));save();return clone(b);
 }
 if(/^\/api\/inbox\/[^/]+\/handle$/.test(p)){
  const m=state().items.find(m=>m.id===p.split('/')[3]);if(!m)return fail(p);
  if(body.expectedActionId!==(m.manualActionId??null))throw Error('测试消息状态已改变');
  Object.assign(m,{manualDisposition:body.action==='undo'?null:body.action,manualActionId:crypto.randomUUID()});save();return clone({item:m});
 }
 if(/^\/api\/inbox\/[^/]+\/topic$/.test(p)){
  const m=state().items.find(m=>m.id===p.split('/')[3]);if(!m)return fail(p);m.topicSignalId||='fixture-signal-'+m.id;m.topicSyncedAt=stamp;save();return clone({item:m});
 }
 if(p.endsWith('/reply-draft'))return {draft:'隔离测试回复草稿：建议先选少量素材，按主题整理后再验证查找效果。'};
 return fail(p);
};
window.fetch=async(raw,init)=>{
 if(raw!=='/api/images/chat'||init?.method!=='POST')return fail(String(raw));
 const body=JSON.parse(init.body);window.__calls.push({url:raw,method:'POST',body});
 let s=state().sessions.find(s=>s.id===body.sessionId);if(!s){s={id:body.sessionId,fixture:true,title:body.text.split('\n')[0],archived:false,running:false,updatedAt:stamp};state().sessions.unshift(s);}s.running=true;
 const turn={id:body.id,sessionId:body.sessionId,input:body.text,output:'',status:'running',error:null,assetIds:[],ratio:body.ratio,skillName:'隔离封面技能'};state().turns.push(turn);save();
 return new Response(new ReadableStream({start(controller){setTimeout(()=>{turn.output='隔离测试：已完成，本次没有调用生图服务。';turn.status='success';turn.assetIds=[body.ratio==='3:4'?'fixture-portrait':body.ratio==='4:3'?'fixture-landscape':'fixture-wide'];s.running=false;save();controller.enqueue(new TextEncoder().encode(JSON.stringify({type:'done',turn})+'\n'));controller.close();},700);}}),{headers:{'Content-Type':'application/x-ndjson'}});
};
window.open=(url)=>{window.__blocked.push(String(url));return {opener:null};};
Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text)=>{window.__copied=text;}}});
document.addEventListener('click',event=>{const a=event.target.closest?.('a');if(a&&/^https?:/.test(a.href)&&new URL(a.href).origin!==location.origin){event.preventDefault();window.__blocked.push(a.href);}},true);
const source=()=>location.pathname+location.search;
function workScope(query){
 const requestedContent=query.get('content'),requestedPost=query.get('post');
 if(!requestedContent&&!requestedPost)return null;
 const contentId=requestedContent||(requestedPost==='fixture-local-post'?'fixture-content':requestedPost==='fixture-other-local-post'?'fixture-other-content':null);
 const c=state().contents.find(c=>c.id===contentId);
 if(!c)return {status:'invalid',message:'这条作品不存在或已经归档'};
 const localPost=c.id==='fixture-content'?'fixture-local-post':'fixture-other-local-post';
 if(requestedPost&&requestedPost!==localPost)return {status:'invalid',message:'作品与平台记录不匹配'};
 return {status:'ready',contentId:c.id,title:c.title,postId:requestedPost,posts:[{id:localPost,platformId:'douyin',platformPostId:c.id==='fixture-content'?'fixture-post':'fixture-other-post'}]};
}
const subscribe=(f)=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f);};
const shared={today,syncWindow:configs.parameters.syncWindow};
function Works({query}){
 const selected=state().contents.find(c=>c.id===query.get('content'))||state().contents[0];
 const rows=works().map((w,i)=>({id:w.id,title:w.title,value:6800+i*2200,capturedAt:stamp,approximate:false}));
 const distribution={rows,median:rows.length?7900:null,count:rows.length,min:rows.length?5800:null,max:rows.length?10000:null};
 const playback={platformName:'抖音',days:[1,3,7,30],minimum:5,distributions:Object.fromEntries([1,3,7,30].map(d=>[d,d===30?{...distribution,rows:rows.map(r=>({...r,value:null})),count:0,median:null,min:null,max:null}:distribution]))};
 return <main className="workspace works-workspace"><WorkspaceHeader current="/works" date={today} syncWindow={shared.syncWindow}/><WorkPageHeader hasWorks={!!selected}/><WorksPlaybackCard data={playback}/><div className="works-grid"><section className="card works-list"><h2>作品</h2>{state().contents.map(c=><a key={c.id} className="list-row work-entry" href={'/works?content='+c.id}><strong>{c.title}</strong><small>视频 · 抖音</small><span>看表现 →</span></a>)}</section><section className="works-detail">{selected?<section className="card"><h2>{selected.title}</h2><p className="small">隔离 fixture · 此处验证共享组件和跳转，服务端完整作品页另行验证。</p><p>播放量 6,800 · 采集日期 10-30</p><a className="button" href={'/inbox?content='+selected.id+'&post='+(selected.id==='fixture-content'?'fixture-local-post':'fixture-other-local-post')}>查看这条作品的评论 →</a></section>:<p className="card collapsed-note">还没有作品</p>}</section></div></main>;
}
function App(){
 const href=useSyncExternalStore(subscribe,source,source),query=new URLSearchParams(href.split('?')[1]||'');
 const route=location.pathname;
 if(route==='/topics')return <Topics parameters={configs.parameters} platforms={configs.platforms} channels={state().channels} initialData={topicsData()} today={today}/>;
 if(route==='/images')return <Images {...shared} config={configs.images} initialData={imageData()} initialTopic={query.get('topic')} initialContent={query.get('content')}/>;
 if(route==='/publishing')return <Publishing {...shared} config={configs.publishing} platforms={configs.platforms} layoutConfig={configs.layouts} initialData={pubData()} initialKind={query.get('kind')||'video'} initialContent={query.get('content')} initialBatchId={query.get('batch')} initialAsset={query.get('asset')} initialTopic={query.get('topic')} expiryHours={configs.parameters.publishUploadExpiryHours} managementPages={{}}/>;
 if(route==='/inbox')return <Inbox {...shared} config={configs.inbox} platforms={configs.platforms} destinations={{douyin:{comment:'https://example.invalid/fixture'}}} initialData={inboxData()} initialMessageId={query.get('message')} initialPriority initialWorkScope={workScope(query)} initialFilters={{reply:query.get('reply')||'waiting',channel:query.get('channel')||(query.has('content')||query.has('post')?'comment':'all'),category:query.get('category')||'all'}}/>;
 if(route==='/works'||route==='/data-center')return <Works query={query}/>;
 return <Dashboard config={configs} today={today} initialData={dashboardData()} initialDeals={dealData()} dealConfig={configs.deals} dealChannels={configs.inbox.channels} dataCenterPlatformId="douyin" presentation={presentation}/>;
}
createRoot(document.getElementById('root')).render(<App/>);
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
      name: 'fixture-isolation',
      setup(b) {
        b.onResolve({ filter: /^next\/(link|navigation)$/ }, (a) => ({ path: a.path, namespace: 'fixture' }));
        b.onResolve({ filter: /use-resource(?:\.ts)?$/ }, () => ({ path: 'resource', namespace: 'fixture' }));
        b.onResolve({ filter: /visible-records(?:\.ts)?$/ }, () => ({ path: 'visibility', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (a) => ({
          resolveDir: root,
          loader: 'tsx',
          contents:
            a.path === 'next/link'
              ? `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`
              : a.path === 'next/navigation'
                ? `import {useSyncExternalStore}from'react';const sub=f=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f)};const query=()=>location.search;export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(sub,query,query));export const usePathname=()=>location.pathname;const router={push(href){location.assign(href)},replace(href){const next=new URL(href,location.href);if(next.pathname!==location.pathname)location.replace(href);else{history.replaceState(null,'',href);window.dispatchEvent(new Event('popstate'))}},refresh(){window.dispatchEvent(new Event('workspace-refresh'))}};export const useRouter=()=>router;`
                : a.path === 'visibility'
                  ? `export const isVisibleRecord=v=>!v?.archivedAt&&!v?.mergedInto;export const visibleRecords=v=>v;`
                  : readFileSync('src/ui/use-resource.ts', 'utf8').replace(
                      /export async function request<T>[\s\S]*?export function useResource/,
                      'export async function request<T>(...args:any[]):Promise<T>{return window.__request(...args)}\nexport function useResource',
                    ),
        }));
      },
    },
  ],
});
writeFileSync(path.join(out, 'app.js'), result.outputFiles[0].text);
const css = ['tokens', 'workspace', 'topics', 'images', 'layouts', 'publishing', 'inbox', 'deals', 'data-center']
  .map((n) => readFileSync(`src/ui/${n}.css`, 'utf8'))
  .join('\n');
writeFileSync(
  path.join(out, 'style.css'),
  css + '\n' + readFileSync('src/app/globals.css', 'utf8').replace(/^@import[^;]*;/gm, ''),
);
writeFileSync(
  path.join(out, 'index.html'),
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="connect-src \'none\'; img-src \'self\' data: blob:; object-src \'none\'"><title>视频创作主线 · 隔离验收</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>',
);
console.log('Fixture preview: ' + out + '; database and real platform operations are not used.');
if (process.argv.includes('--serve')) {
  const port = Number(process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] || 4319);
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'GET') {
      res.writeHead(405);
      res.end('Fixture server is read-only');
      return;
    }
    if (/^\/api\/images\/assets\/fixture-[a-z-]+\/file$/.test(url.pathname)) {
      const id = url.pathname.split('/')[4],
        portrait = id.includes('portrait'),
        square = id.includes('square'),
        wide = id.includes('wide');
      const [w, h] = portrait ? [750, 1000] : square ? [1000, 1000] : wide ? [1600, 900] : [1000, 750];
      res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
      res.end(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#EEECE8"/><rect x="30" y="30" width="${w - 60}" height="${h - 60}" fill="none" stroke="#BDBBB7" stroke-width="3"/><text x="60" y="130" font-family="sans-serif" font-size="48" fill="#1A1A1A">FIXTURE / ${w} × ${h}</text><text x="60" y="210" font-family="sans-serif" font-size="32" fill="#5F5D58">隔离测试封面</text><rect x="60" y="270" width="${w - 120}" height="${h - 330}" fill="#D9D7D3"/></svg>`,
      );
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(403);
      res.end('Real API requests are blocked');
      return;
    }
    const file = url.pathname === '/app.js' ? 'app.js' : url.pathname === '/style.css' ? 'style.css' : 'index.html';
    res.writeHead(200, {
      'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html',
      'Cache-Control': 'no-store',
    });
    res.end(readFileSync(path.join(out, file)));
  });
  server.listen(port, '127.0.0.1', () => console.log(`Isolated preview http://127.0.0.1:${port}`));
}
