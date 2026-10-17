import type { Content } from './content-model';
import { z } from 'zod';
import type { Asset } from './image-model';
import type { Platform } from './config';
import type { LayoutContent,LayoutPlatform } from './layout-model';
export const publishKindSchema=z.enum(['video','layout','xhs']);
export type PublishKind=z.infer<typeof publishKindSchema>;
const ratioSchema=z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/).refine(s=>s.split(':').every(n=>Number(n)>0));
const clockSchema=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const publishingConfigSchema=z.object({
  videoMaxMB:z.number().positive(),videoTypes:z.array(z.string()).min(1),imageMaxMB:z.number().positive(),imageTypes:z.array(z.string()).min(1),xhsMaxImages:z.number().int().positive(),requiredVideoRatios:z.array(ratioSchema).min(1),
  templates:z.array(z.object({platformId:z.string().min(1),kinds:z.array(publishKindSchema).min(1),videoCoverRatio:ratioSchema.nullable(),titleMax:z.number().int().positive().nullable(),descriptionMax:z.number().int().positive().nullable(),tags:z.array(z.string()),description:z.string(),defaultTime:clockSchema.nullable(),verified:z.boolean()})).min(1),
});
export type PublishingConfig=z.infer<typeof publishingConfigSchema>;
export const publishSettingSchema=z.object({platformId:z.string().min(1),title:z.string().max(1000),description:z.string().max(100000),tags:z.array(z.string().trim().min(1).max(100)).max(100),scheduleAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).nullable()}).strict();
export const publishDraftSchema=z.object({kind:publishKindSchema,contentId:z.string().nullable(),videoId:z.string().nullable(),imageIds:z.array(z.string()).refine(ids=>new Set(ids).size===ids.length),snapshotIds:z.array(z.string()).refine(ids=>new Set(ids).size===ids.length),settings:z.array(publishSettingSchema).refine(items=>new Set(items.map(p=>p.platformId)).size===items.length)}).strict().refine(d=>d.kind==='video'?(!d.imageIds.length&&!d.snapshotIds.length):d.kind==='layout'?(!d.videoId&&!d.imageIds.length):(!d.videoId&&!d.snapshotIds.length),{message:'发布来源不可混用'});
export type PublishDraft=z.infer<typeof publishDraftSchema>;
export type PublishSetting=z.infer<typeof publishSettingSchema>;
export type PublishBatch={id:string;revision:number;state:'draft'|'queued'|'running'|'finished';draft:PublishDraft;createdAt:string};
export type PublishReceipt={id:string;batchId:string;platformId:string;status:'queued'|'submitting'|'pending_review'|'published'|'failed'|'unknown';title:string;platformPostId:string|null;url:string|null;publishedAt:string|null;reason:string|null;safeToRetry:boolean;revision:number};
export type PublishSnapshot={id:string;layoutId:string;layoutRevision:number;contentId:string;platform:LayoutPlatform;content:LayoutContent;confirmedAt:string;state:'ready'|'queued'|'published'|'returned'};
export type PublishVideo={id:string;contentId:string;name:string;bytes:number;duration:number;width:number;height:number};
export type PublishingData={contents:Content[];videos:PublishVideo[];assets:Asset[];snapshots:PublishSnapshot[];batches:PublishBatch[];receipts:PublishReceipt[];accounts:{platformId:string;ready:boolean;reason:string}[];recommendations:{platformId:string;month:string;time:string;basis:string}[];storageReady:boolean;aiReady:boolean;publishReady:boolean;handoffReady:boolean;message:string};
export const publishUpdateSchema=publishDraftSchema.safeExtend({expectedRevision:z.number().int().nonnegative()});
export const publishActionSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('publish'),expectedRevision:z.number().int().nonnegative(),requestId:z.string().uuid(),confirmed:z.literal(true),materials:z.string().min(1).max(2000000)}).strict(),
  z.object({action:z.literal('ai'),expectedRevision:z.number().int().nonnegative(),instruction:z.string().trim().min(1).max(10000)}).strict(),
  z.object({action:z.literal('return'),expectedRevision:z.number().int().nonnegative(),snapshotId:z.string().min(1)}).strict(),
]);
export const publishRetrySchema=z.object({expectedRevision:z.number().int().nonnegative(),requestId:z.string().uuid(),confirmed:z.literal(true)}).strict();
export const publishMediaSchema=z.object({kind:z.enum(['video','xhs']),contentId:z.string().min(1)}).strict();
export function newPublishDraft(kind:PublishKind):PublishDraft{return {kind,contentId:null,videoId:null,imageIds:[],snapshotIds:[],settings:[]};}
export function makePublishSetting(platformId:string,title:string,config:PublishingConfig):PublishSetting {
  const template=config.templates.find(t=>t.platformId===platformId);
  return {platformId,title,description:template?.description??'',tags:[...(template?.tags??[])],scheduleAt:null};
}
export function autoVideoCovers(contentId:string|null,assets:Asset[],config:PublishingConfig,choices:Record<string,string>={}){
  return config.requiredVideoRatios.map(ratio=>{
    const [w,h]=ratio.split(':').map(Number);
    const id=choices[ratio];
    const asset=id?assets.find(a=>a.id===id&&a.contentId===contentId&&a.purposeId==='video_cover'&&a.width>0&&a.height>0&&Math.abs(a.width*h-a.height*w)<0.01):null;
    return {ratio,asset:asset??null,reason:asset?'':id?'采用的封面已失效，请重新选择':'尚未指定作品采用的封面'};
  });
}
export function scheduleTime(value:string):number {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))return NaN;
  const time=Date.parse(`${value}:00+08:00`);
  if(!Number.isFinite(time))return NaN;
  return new Date(time+8*3600000).toISOString().slice(0,16)===value?time:NaN;
}
export function defaultPublishTime(platformId:string,data:PublishingData,config:PublishingConfig,now:number):string|null {
  const day=new Date(now+8*3600000).toISOString().slice(0,10);
  const recommendation=data.recommendations.find(r=>r.platformId===platformId&&r.month===day.slice(0,7));
  const time=recommendation?.time??config.templates.find(t=>t.platformId===platformId)?.defaultTime;
  if(!time||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
  const today=`${day}T${time}`;
  return scheduleTime(today)>now?today:`${new Date(now+32*3600000).toISOString().slice(0,10)}T${time}`;
}
export function canRetryReceipt(receipt:PublishReceipt){return receipt.status==='failed'&&receipt.safeToRetry;}
export function publishIssues(draft:PublishDraft,data:PublishingData,config:PublishingConfig,platforms:Platform[],now:number):string[]{
  const issues:string[]=[];
  if(!draft.contentId||!data.contents.some(c=>c.id===draft.contentId))issues.push('请关联有效作品');
  const content=data.contents.find(c=>c.id===draft.contentId);if(content&&content.form!==(draft.kind==='video'?'视频':'图文'))issues.push('作品内容形式与发布来源不一致');
  if(!draft.settings.length)issues.push('请选择发布平台');
  if(draft.kind==='video'){
    if(!data.videos.some(v=>v.id===draft.videoId&&v.contentId===draft.contentId))issues.push('请上传并保存这条作品的成片');
    for(const cover of autoVideoCovers(draft.contentId,data.assets,config,content?.videoCovers))if(!cover.asset)issues.push(`${cover.ratio}：${cover.reason}`);
  }
  if(draft.kind==='xhs'){
    if(!draft.imageIds.length)issues.push('请添加自己制作的图文图片');
    if(draft.imageIds.length>config.xhsMaxImages)issues.push(`图片最多 ${config.xhsMaxImages} 张`);
    if(draft.imageIds.some(id=>!data.assets.some(a=>a.id===id&&a.source==='upload')))issues.push('图片必须来自用户上传素材');
  }
  for(const setting of draft.settings){
    const platform=platforms.find(p=>p.id===setting.platformId);const template=config.templates.find(t=>t.platformId===setting.platformId);const name=platform?.name??setting.platformId;
    if(!platform?.active)issues.push(`${name}尚未启用`);
    if(!template?.kinds.includes(draft.kind)){issues.push(`${name}不支持此来源`);continue;}
    if(!template.verified||template.titleMax===null||(draft.kind!=='layout'&&template.descriptionMax===null))issues.push(`${name}发布模板待核验`);
    if(!data.accounts.some(a=>a.platformId===setting.platformId&&a.ready))issues.push(`${name}账号尚未就绪`);
    if(!setting.title.trim())issues.push(`${name}缺少标题`);
    if(template.titleMax!==null&&Array.from(setting.title).length>template.titleMax)issues.push(`${name}标题超过 ${template.titleMax} 字`);
    if(template.descriptionMax!==null&&Array.from(setting.description).length>template.descriptionMax)issues.push(`${name}文案超过 ${template.descriptionMax} 字`);
    if(setting.scheduleAt!==null&&(!Number.isFinite(scheduleTime(setting.scheduleAt))||scheduleTime(setting.scheduleAt)<=now))issues.push(`${name}定时时间无效或已过期`);
    if(draft.kind==='layout'){
      const snapshots=data.snapshots.filter(s=>draft.snapshotIds.includes(s.id)&&s.platform===setting.platformId&&s.contentId===draft.contentId&&s.state==='ready');
      if(snapshots.length!==1)issues.push(`${name}须有唯一待发布确认稿`);
      else {const snapshot=snapshots[0];if(snapshot.content.title!==setting.title||setting.description!=='')issues.push(`${name}确认稿内容不可改写`);const ids=[...snapshot.content.blocks.filter(b=>b.type==='image').map(b=>b.assetId),...Object.values(snapshot.content.covers)];if(ids.some(id=>!data.assets.some(a=>a.id===id)))issues.push(`${name}确认稿配图缺失`);}
    }
  }
  if(draft.kind==='layout'&&draft.snapshotIds.some(id=>!data.snapshots.some(s=>s.id===id&&s.contentId===draft.contentId&&draft.settings.some(p=>p.platformId===s.platform))))issues.push('确认稿必须属于本作品及所选平台');
  return issues;
}

export function publishMaterialKey(draft:PublishDraft,data:PublishingData,config:PublishingConfig):string {
  const content=data.contents.find(c=>c.id===draft.contentId);
  const covers=draft.kind==='video'?autoVideoCovers(draft.contentId,data.assets,config,content?.videoCovers):[];
  const snapshots=data.snapshots.filter(s=>draft.snapshotIds.includes(s.id)).sort((a,b)=>a.id.localeCompare(b.id));
  const ids=new Set([...draft.imageIds,...covers.flatMap(c=>c.asset?[c.asset.id]:[]),...snapshots.flatMap(s=>[...s.content.blocks.flatMap(b=>b.assetId?[b.assetId]:[]),...Object.values(s.content.covers)])]);
  return JSON.stringify({draft,content,video:data.videos.find(v=>v.id===draft.videoId),snapshots,assets:data.assets.filter(a=>ids.has(a.id)).sort((a,b)=>a.id.localeCompare(b.id)).map(a=>({id:a.id,version:a.version,width:a.width,height:a.height,purposeId:a.purposeId,contentId:a.contentId})),templates:config.templates.filter(t=>draft.settings.some(s=>s.platformId===t.platformId)),accounts:data.accounts.filter(a=>draft.settings.some(s=>s.platformId===a.platformId))});
}
