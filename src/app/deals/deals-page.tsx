'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import type { Platform } from '@/lib/config';
import { confirmedDeal,dealCounts,dealEditSchema,dealFields,dealSource,filterDeals,suggestionIssue,type Deal,type DealConfig,type DealData,type DealFilters,type DealStatus } from '@/lib/deal-model';
import { assessReplies,inboxPage,inboxTime,type InboxConfig } from '@/lib/inbox-model';
import { Button,Card,Dialog,Empty,Segmented } from '@/ui/components';
import { WorkspaceHeader } from '@/ui/workspace-header';
import { request,useResource } from '@/ui/use-resource';
const blankFilters:DealFilters={status:'all',platform:'all',channel:'all',query:'',linkedId:null};
const replyLabels={waiting:'待回复',replied:'已回复',unknown:'待核对'};
type Editor={base:Deal;brand:string;requirement:string;status:DealStatus};
export default function DealsPage({config,channels,platforms,initialData,initialId,initialStatus,today,syncWindow}:{config:DealConfig;channels:InboxConfig['channels'];platforms:Platform[];initialData:DealData;initialId:string|null;initialStatus:string;today:string;syncWindow:string}){
  const {data,error,refresh}=useResource('/api/deals',initialData);
  const [filters,setFilters]=useState<DealFilters>({...blankFilters,status:initialId?'all':initialStatus,linkedId:initialId});
  const [selectedId,setSelectedId]=useState<string|null>(initialId),[requestedPage,setRequestedPage]=useState(1);
  const [editor,setEditor]=useState<Editor|null>(null),[discard,setDiscard]=useState<'close'|'reload'|null>(null);
  const [busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false),[notice,setNotice]=useState(''),[editError,setEditError]=useState('');
  const [receipts,setReceipts]=useState<Record<string,Deal>>({});
  const items=data.items.map(item=>receipts[item.id]?.revision>item.revision?receipts[item.id]:item);
  const scoped=filterDeals(items,data.messages,{...blankFilters,platform:filters.platform,channel:filters.channel});
  const counts=dealCounts(scoped),visible=filterDeals(items,data.messages,filters),page=inboxPage(visible,requestedPage,config.pageSize);
  const active=page.items.find(d=>d.id===selectedId)??null;
  const source=active?dealSource(active,data.messages):null;
  const replies=assessReplies(data.messages),assessment=source?replies.get(source.id):null;
  const suggestion=active?.suggestion,issue=active?suggestionIssue(active,data.messages):null;
  const evidence=suggestion?data.messages.find(m=>m.id===suggestion.evidenceMessageId):null;
  const platformName=(id:string)=>platforms.find(p=>p.id===id)?.name??`${id}（历史平台）`;
  const channelName=(id:string)=>channels.find(c=>c.id===id)?.name??id;
  const stateName=(id:string)=>config.statuses.find(s=>s.id===id)?.name??id;
  const allPlatforms=[...platforms.map(p=>({id:p.id,name:p.name})),...Array.from(new Set(items.map(d=>d.source.platformId))).filter(id=>!platforms.some(p=>p.id===id)).map(id=>({id,name:platformName(id)}))];
  const count=(n:number)=>data.recordsReady?n.toLocaleString('en-US'):'--';
  const fields=editor?{brand:editor.brand.trim()||null,requirement:editor.requirement.trim()||null,status:editor.status}:null;
  const dirty=!!editor&&JSON.stringify(fields)!==JSON.stringify(dealFields(editor.base));
  const latest=editor?items.find(d=>d.id===editor.base.id):null;
  const conflict=!!editor&&(!latest||latest.revision!==editor.base.revision);
  const editValid=!!fields&&dealEditSchema(config).safeParse({...fields,expectedRevision:editor?.base.revision}).success;
  useEffect(()=>{if(page.page!==requestedPage)setRequestedPage(page.page);},[page.page,requestedPage]);
  useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  function filter(patch:Partial<DealFilters>){setFilters(current=>({...current,...patch}));setRequestedPage(1);setSelectedId(null);}
  async function reload(){if(refreshing||busy)return;setRefreshing(true);try{await refresh();}finally{setRefreshing(false);}}
  function openEditor(deal:Deal){if(!data.writeReady||busy)return;setEditor({base:structuredClone(deal),brand:deal.brand??'',requirement:deal.requirement??'',status:deal.status});setEditError('');setDiscard(null);}
  function closeEditor(){if(busy)return;if(dirty)setDiscard('close');else{setEditor(null);setEditError('');}}
  function discardEdits(){if(discard==='reload'&&latest)openEditor(latest);else setEditor(null);setDiscard(null);setEditError('');}
  async function save(){
    if(!editor||!fields||!dirty||!editValid||conflict||busy||!data.writeReady)return;
    const current=editor.base;setBusy(true);setEditError('');
    try{const result=await request<{item:unknown}>(`/api/deals/${encodeURIComponent(current.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({...fields,expectedRevision:current.revision})});const saved=confirmedDeal(current,fields,result.item);setReceipts(receipts=>({...receipts,[saved.id]:saved}));setEditor(null);setNotice('商单已保存。平台消息与回复状态未更改。');await refresh();}
    catch(error){setEditError(error instanceof Error?error.message:'保存失败，编辑内容已保留。');await refresh();}finally{setBusy(false);}
  }
  async function accept(deal:Deal){
    if(busy||!data.writeReady||!data.suggestionReady||!deal.suggestion||suggestionIssue(deal,data.messages))return;
    setBusy(true);setNotice('');const next={...dealFields(deal),status:deal.suggestion.status};
    try{const result=await request<{item:unknown}>(`/api/deals/${encodeURIComponent(deal.id)}/suggestion`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({suggestionId:deal.suggestion.id,expectedRevision:deal.revision})});const saved=confirmedDeal(deal,next,result.item);setReceipts(receipts=>({...receipts,[saved.id]:saved}));setNotice(`已确认状态为“${stateName(saved.status)}”。未向平台发送任何消息。`);await refresh();}
    catch(error){setNotice(error instanceof Error?error.message:'建议未确认，商单状态保持不变。');await refresh();}finally{setBusy(false);}
  }
  return <main className="workspace deals-workspace">
    <WorkspaceHeader current="/deals" date={today} syncWindow={syncWindow}/>
    <div className="modebar"><span className="eyebrow">07 · BRAND COLLABORATIONS</span><span>{data.message}</span></div>
    <div className="topics-heading"><div><h1>商单列表</h1><p>从合作线索，到跟进完成。每条商单都有来源。</p></div><div className="image-heading-actions"><Link className="button" href="/inbox">查看互动收件箱 →</Link><Button disabled={busy||refreshing} onClick={()=>void reload()}>{refreshing?'正在读取记录…':'刷新已存记录'}</Button></div></div>
    <div className="deal-summary" aria-label="商单状态概况">{config.statuses.map((status,index)=><button key={status.id} className={filters.status===status.id?'active':''} aria-pressed={filters.status===status.id} onClick={()=>filter({status:status.id,query:'',linkedId:null})}><span className="eyebrow">0{index+1} · {status.id}</span><div><strong className={`mono ${status.id==='pending'&&data.recordsReady&&counts.pending>0?'deal-attention':''}`}>{count(counts[status.id])}</strong><span>{status.name}</span></div><p>{status.description}</p></button>)}</div>
    <p className="small deal-summary-note">数量随平台与来源类型变化，包含历史商单。商单进度与消息是否已回复分别记录。</p>
    <div className="deal-filters"><label>平台<select aria-label="筛选商单平台" value={filters.platform} onChange={e=>filter({platform:e.target.value})}><option value="all">全部平台</option>{allPlatforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><Segmented label="商单来源类型" value={filters.channel} options={[{value:'all',label:'全部来源'},...channels.map(c=>({value:c.id,label:c.name}))]} onChange={channel=>filter({channel})}/><label>进度<select aria-label="筛选商单状态" value={filters.status} onChange={e=>filter({status:e.target.value})}><option value="all">全部状态</option>{config.statuses.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="deal-search">搜索<input aria-label="搜索商单" type="search" placeholder="品牌、合作需求、发送者" value={filters.query} onChange={e=>filter({query:e.target.value})}/></label><Button onClick={()=>filter(blankFilters)}>重置筛选</Button></div>
    {filters.linkedId&&<div className="deal-linked"><span>正在查看链接指定的商单</span><Button onClick={()=>filter({linkedId:null})}>查看全部商单</Button></div>}
    {notice&&<p className="topic-feedback" role="status">{notice}</p>}{error&&<p className="topic-feedback" role="alert">{error}</p>}
    <div className="deal-grid"><Card index="01" title="合作线索" meta={<span className="eyebrow">{count(visible.length)} RECORDS</span>} className="deal-list-card">
      <div className="deal-table-heading eyebrow" aria-hidden="true"><span>BRAND / REQUIREMENT</span><span>SOURCE</span><span>STATUS</span><span>UPDATED</span></div>
      <div className="deal-list">{page.items.length?page.items.map(deal=>{const msg=dealSource(deal,data.messages);return <button key={deal.id} className={`deal-row ${active?.id===deal.id?'active':''}`} aria-pressed={active?.id===deal.id} onClick={()=>{setSelectedId(deal.id);setNotice('');}}><div><strong>{deal.brand||'品牌待核实'}</strong><p>{deal.requirement||'合作需求尚未提取'}</p></div><div><span>{platformName(deal.source.platformId)} · {channelName(deal.source.channel)}</span><small>{msg?.author||'发送者待核实'}</small></div><span className="deal-state">{stateName(deal.status)}</span><time className="mono" dateTime={deal.updatedAt}>{inboxTime(deal.updatedAt)}</time></button>;}):<Empty>{!data.recordsReady?'商单服务待接入，暂无记录':filters.linkedId?'指定商单暂不可用，请刷新或返回全部商单':items.length?'没有符合筛选条件的商单':'暂无从评论或私信识别的商单线索'}</Empty>}</div>
      <div className="deal-pagination"><span className="small">按更新时间倒序 · 每页 <span className="mono">{config.pageSize}</span> 条</span><Button aria-label="上一页商单" disabled={page.page===1} onClick={()=>{setRequestedPage(page.page-1);setSelectedId(null);}}>←</Button><span className="mono">{data.recordsReady?`${page.page} / ${page.pages}`:'-- / --'}</span><Button aria-label="下一页商单" disabled={page.page===page.pages} onClick={()=>{setRequestedPage(page.page+1);setSelectedId(null);}}>→</Button></div>
      <p className="small deal-list-note">线索从互动消息自动进入，不在这里重复创建；原始消息始终保留。</p>
    </Card><aside className="deal-detail-column">
      <Card index="02" title="商单详情" meta={<span className="eyebrow">DETAIL</span>}>
        {!active?<Empty>选择一条商单，查看需求与来源</Empty>:<><div className="deal-detail-title"><h3>{active.brand||'品牌待核实'}</h3><span className="deal-state">{stateName(active.status)}</span></div><p className="deal-requirement">{active.requirement||'合作需求尚未提取，请以原始消息为准。'}</p><dl className="deal-metadata"><div><dt>来源</dt><dd>{platformName(active.source.platformId)} · {channelName(active.source.channel)}</dd></div><div><dt>创建时间</dt><dd className="mono">{inboxTime(active.createdAt)}</dd></div><div><dt>最近更新</dt><dd className="mono">{inboxTime(active.updatedAt)}</dd></div><div><dt>平台回复状态</dt><dd>{replyLabels[assessment?.state??'unknown']}</dd></div><div><dt>回复依据读取于</dt><dd className="mono">{inboxTime(assessment?.observed.capturedAt??null)}</dd></div></dl><div className="deal-edit-action"><Button disabled={!data.writeReady||busy} title={!data.writeReady?'商单保存服务待接入':undefined} onClick={()=>openEditor(active)}>修改商单</Button><span className="small">{data.writeReady?'品牌、需求和进度可修改':'保存服务待接入，暂不能修改'}</span></div><p className="small deal-list-note">更改商单进度不会标记消息已回复。请在平台沟通，回复状态随下次读取更新。</p></>}
      </Card>
      <Card index="03" title="原始消息" meta={<span className="eyebrow">SOURCE</span>}>{!active?<Empty>选择商单后查看关联消息</Empty>:<>{source?<><div className="deal-source-author"><strong>{source.author||'发送者待核实'}</strong><time className="mono" dateTime={source.sentAt??undefined}>{inboxTime(source.sentAt)}</time></div><p className="deal-source-body">{source.body||'消息原文尚未读取完整'}</p>{source.contentTitle&&<p className="small">关联作品：{source.contentTitle}</p>}</>:<Empty>关联消息暂不可用，不补填原文</Empty>}<div className="deal-source-links"><Link href={`/inbox?message=${encodeURIComponent(active.source.messageId)}`}>查看消息与上下文 →</Link>{source?.sourceUrl&&/^https?:\/\//.test(source.sourceUrl)&&<a href={source.sourceUrl} target="_blank" rel="noreferrer">原始平台页面 ↗</a>}</div></>}</Card>
      <Card index="04" title="状态建议" meta={<span className="eyebrow">HUMAN CONFIRM</span>}>{!active?<Empty>选择商单后查看已有建议</Empty>:!suggestion?<Empty>{data.suggestionReady?'暂无新的状态建议':'状态建议服务待接入'}</Empty>:<div className="deal-suggestion"><strong>{stateName(active.status)} → {stateName(suggestion.status)}</strong><p>{suggestion.reason}</p>{evidence&&<blockquote><p>{evidence.body||'证据原文缺失'}</p><span className="small">{evidence.author||'发送者待核实'} · <span className="mono">{inboxTime(evidence.sentAt)}</span></span></blockquote>}{issue&&<p role="status">{issue}</p>}<Button disabled={!!issue||!data.writeReady||!data.suggestionReady||busy} onClick={()=>void accept(active)}>{busy?'正在处理…':`确认改为${stateName(suggestion.status)}`}</Button>{!data.suggestionReady&&<span className="small">建议确认服务待接入，此操作暂不可用。</span>}</div>}<p className="small deal-list-note">根据新私信往来提供建议，由你确认后才更新商单；不会自动发送消息。</p></Card>
    </aside></div>
    <footer className="layout-foot"><span>评论 / 私信 → 合作线索 → 人工跟进</span><span>创建与更新时间由服务记录 · 历史商单持续保留</span></footer>
    {editor&&<Dialog title="修改商单" onClose={closeEditor}>
      <p className="dialog-intro">仅修改本机商单。来源与创建时间保持不变，不向合作方发送消息。</p>
      <fieldset disabled={busy} className="deal-edit-form"><label>品牌 / 合作方<input aria-label="商单品牌" maxLength={config.brandMaxLength} value={editor.brand} placeholder="尚未核实可留空" onChange={e=>setEditor({...editor,brand:e.target.value})}/></label><label>合作需求<textarea aria-label="商单合作需求" maxLength={config.requirementMaxLength} rows={5} value={editor.requirement} placeholder="按实际沟通填写，尚未明确可留空" onChange={e=>setEditor({...editor,requirement:e.target.value})}/></label><label>商单状态<select aria-label="修改商单状态" value={editor.status} onChange={e=>setEditor({...editor,status:e.target.value as DealStatus})}>{config.statuses.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label></fieldset>
      {editError&&<p role="alert" className="deal-edit-feedback">{editError}</p>}{conflict&&<div className="deal-edit-feedback" role="alert"><p>这条商单已更新或暂不可用。你的编辑已保留，请核对最新记录后再保存。</p>{latest&&<Button disabled={busy} onClick={()=>dirty?setDiscard('reload'):openEditor(latest)}>载入最新记录</Button>}</div>}
      {discard?<div className="deal-discard" role="alert"><p>有内容尚未保存。{discard==='reload'?'载入最新记录会替换这些编辑。':'关闭会放弃这些编辑。'}</p><Button onClick={()=>setDiscard(null)}>继续编辑</Button><Button onClick={discardEdits}>放弃未保存内容并继续</Button></div>:<div className="deal-dialog-actions"><span className="small">{dirty?'有未保存的编辑':'与已存记录一致'}</span><Button disabled={busy} onClick={closeEditor}>取消</Button><Button className="selected" disabled={!data.writeReady||!dirty||!editValid||conflict||busy} onClick={()=>void save()}>{busy?'正在保存…':'保存修改'}</Button></div>}
    </Dialog>}
  </main>;
}
