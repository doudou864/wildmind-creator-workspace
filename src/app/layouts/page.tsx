import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadLayoutConfig } from '@/lib/layout-config';
import { readLayouts } from '@/lib/workspace-service';
import LayoutsPage from './layouts-page';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'排版中心 · WILDMIND 野生脑洞工作台'};
export default async function Page({searchParams}:{searchParams:Promise<{content?:string;topic?:string;layout?:string}>}){
  const query=await searchParams;
  const [workspace,config,data]=await Promise.all([loadConfig(),loadLayoutConfig(),readLayouts()]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return <LayoutsPage key={`${query.layout??""}:${query.content??""}:${query.topic??""}`} initialLayout={query.layout??null} initialContent={query.content??null} initialTopic={query.topic??null} config={config} initialData={data} today={today} syncWindow={workspace.parameters.syncWindow}/>;
}
