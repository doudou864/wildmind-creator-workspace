import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadImageConfig } from '@/lib/image-config';
import { readImages } from '@/lib/workspace-service';
import ImagesPage from './images-page';
export const dynamic='force-dynamic';
export const metadata: Metadata={title:'生图中心 · WILDMIND 野生脑洞工作台'};
export default async function Page({searchParams}:{searchParams:Promise<{topic?:string}>}){
  const [config,imageConfig,data,query]=await Promise.all([loadConfig(),loadImageConfig(),readImages(),searchParams]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return <ImagesPage config={imageConfig} initialData={data} today={today} syncWindow={config.parameters.syncWindow} initialTopic={query.topic??null}/>;
}
