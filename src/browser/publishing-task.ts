import { runEgo } from './ego.ts';
import type { PublishingTask } from '../lib/publishing-task-model.ts';

// Only the workspace explicitly registered to this task may be closed. Never claim user-owned workspaces.
export async function closePublishingBrowser(browser: NonNullable<PublishingTask['browser']>) {
  await runEgo(`const spaces=await listTaskSpaces();const entry=spaces.find(s=>s.id===${browser.spaceId});if(!entry){console.log('WORKSPACE_RESULT:'+JSON.stringify({closed:true}));}else{const t=await ${browser.pausedByTask ? 'takeOverTaskSpace' : 'taskSpace'}(${browser.spaceId});
if(t.name!==${JSON.stringify(browser.name)})throw Error('发布任务浏览器身份不符，未关闭');
await t.finish({keep:[]});console.log('WORKSPACE_RESULT:'+JSON.stringify({closed:true}));}`);
}

export async function pausePublishingBrowser(browser: NonNullable<PublishingTask['browser']>) {
  await runEgo(
    `const t=await taskSpace(${browser.spaceId});if(t.name!==${JSON.stringify(browser.name)})throw Error('任务浏览器身份不符');await t.handOff();console.log('WORKSPACE_RESULT:true');`,
  );
}
export async function resumePublishingBrowser(browser: NonNullable<PublishingTask['browser']>) {
  await runEgo(
    `const t=await takeOverTaskSpace(${browser.spaceId});if(t.name!==${JSON.stringify(browser.name)})throw Error('任务浏览器身份不符');console.log('WORKSPACE_RESULT:true');`,
  );
}

export async function findPublishingBrowser(name: string) {
  return (await runEgo(
    `const spaces=await listTaskSpaces();const entry=spaces.find(s=>s.name===${JSON.stringify(name)});console.log('WORKSPACE_RESULT:'+JSON.stringify(entry?{spaceId:entry.id,name:entry.name}:null));`,
  )) as NonNullable<PublishingTask['browser']> | null;
}
