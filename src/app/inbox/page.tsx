import type { Metadata } from 'next';
import { loadConfig } from '@/lib/config';
import { loadInboxConfig } from '@/lib/inbox-config';
import { readInbox } from '@/lib/workspace-service';
import InboxPage from './inbox-page';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'互动收件箱 · WILDMIND 野生脑洞工作台'};
export default async function Page(){
  const [workspace,config,data]=await Promise.all([loadConfig(),loadInboxConfig(),readInbox()]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return <InboxPage config={config} platforms={workspace.platforms} initialData={data} today={today} syncWindow={workspace.parameters.syncWindow}/>;
}
