import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadPublishingConfig } from '@/lib/publishing-config';
import { loadLayoutConfig } from '@/lib/layout-config';
import { readPublishing } from '@/lib/workspace-service';
import PublishingPage from './publishing-page';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'发布中心 · WILDMIND 野生脑洞工作台'};
export default async function Page({searchParams}:{searchParams:Promise<{content?:string;kind?:string}>}){
  const query=await searchParams;
  const workspace=await loadConfig();const [config,layoutConfig,data]=await Promise.all([loadPublishingConfig(workspace.platforms),loadLayoutConfig(),readPublishing()]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return <PublishingPage key={`${query.content??""}:${query.kind??""}`} initialContent={query.content??null} initialKind={query.kind==="layout"||query.kind==="xhs"?query.kind:"video"} config={config} layoutConfig={layoutConfig} platforms={workspace.platforms} initialData={data} today={today} syncWindow={workspace.parameters.syncWindow}/>;
}
