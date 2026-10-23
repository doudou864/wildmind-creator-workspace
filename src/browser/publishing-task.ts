import { runEgo } from './ego.ts';
import type { PublishingTask } from '../lib/publishing-task-model.ts';

// Only the workspace explicitly registered to this task may be closed. Never claim user-owned workspaces.
export async function closePublishingBrowser(browser: NonNullable<PublishingTask['browser']>) {
  await runEgo(`const t=await taskSpace(${browser.spaceId});
if(t.name!==${JSON.stringify(browser.name)})throw Error('发布任务浏览器身份不符，未关闭');
await t.finish({keep:[]});console.log('WORKSPACE_RESULT:'+JSON.stringify({closed:true}));`);
}
