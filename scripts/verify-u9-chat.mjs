// Live local SDK smoke test using only a temporary explicitly marked fixture work.
import { build } from 'esbuild';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const file = 'data/u9-chat-smoke.mjs';
await mkdir('data', { recursive: true });
const source = `import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';import {initializeDatabase} from './src/db/database';import {contents,imageChats,imageChatTurns,imageGenerations} from './src/db/schema';import {runImageChat} from './src/lib/image-chat-store';const folder=await mkdtemp(path.join(tmpdir(),'u9-live-fixture-')),db=await initializeDatabase(path.join(folder,'db'));try{db.db.insert(contents).values({id:'fixture-live',fixture:true,title:'fixture-only',form:'图文',updatedAt:'fixture',videoCovers:{}}).run();const events=[];const common={contentId:'fixture-live',referenceIds:[],purposeId:'free'};await runImageChat(db,{...common,id:randomUUID(),text:'这是隔离测试，不生成图片。请原样回复：U9 streaming fixture'},text=>events.push(text));const first=db.db.select().from(imageChats).all()[0].threadId;await runImageChat(db,{...common,id:randomUUID(),text:'这是同一测试会话，不生成图片。请只回复上一条要求中的英文短语。'},text=>events.push(text));await writeFile('docs/verification/u9/d/live-chat-proof.json',JSON.stringify({fixtureOnly:true,sameThread:first===db.db.select().from(imageChats).all()[0].threadId,eventCount:events.length,turns:db.db.select().from(imageChatTurns).all().map(t=>({input:t.input,output:t.output,status:t.status,error:t.error})),usage:db.db.select().from(imageGenerations).all().map(g=>({calls:g.calls,durationMs:g.durationMs,status:g.status}))},null,2));}finally{db.sqlite.close();await rm(folder,{recursive:true,force:true})}`;
await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' },
  outfile: file,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const result = spawnSync(process.execPath, [file], { stdio: 'inherit', timeout: 360000 });
await rm(file, { force: true });
if (result.status !== 0) process.exitCode = 1;
