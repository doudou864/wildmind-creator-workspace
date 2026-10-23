// One real SDK turn, isolated database, explicitly labelled fixture image.
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await mkdir('data', { recursive: true });
const file = 'data/cover-chat-smoke.mjs';
const source = `import {mkdtemp,rm,writeFile,copyFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';import {initializeDatabase} from './src/db/database';import {assets,contents} from './src/db/schema';import {runImageChat} from './src/lib/image-chat-store';import {loadImageChatSkills} from './src/lib/image-chat-skills';
const folder=await mkdtemp(path.join(tmpdir(),'cover-chat-live-fixture-')),db=await initializeDatabase(path.join(folder,'db'));const files=[];
try{const skill=(await loadImageChatSkills()).find(s=>s.name==='doudou-editorial-cover');if(!skill)throw Error('Missing cover skill');const input={id:randomUUID(),sessionId:randomUUID(),purposeId:'video_cover',referenceIds:[],skillId:skill.id,text:'这是工作台隔离验收，只生成一张4:3测试图片。调用已选技能，使用技能中已认可的参考图和配色。主标题准确写 FIXTURE，副标题写 隔离测试，主体为简单几何立方体。不关联任何真实作品。不需要追问，不生成其他版本。保留原图。'};const turn=await runImageChat(db,input,()=>{});const rows=db.db.select().from(assets).all();for(const a of rows){files.push(a.path);await copyFile(a.path,'docs/verification/cover-chat/live-'+a.id+'.png');}await writeFile('docs/verification/cover-chat/live-proof.json',JSON.stringify({fixtureOnly:true,skill:skill.name,input:input.text,turn,workCount:db.db.select().from(contents).all().length,images:rows.map(a=>({id:a.id,width:a.width,height:a.height,ratio:a.ratio,contentId:a.contentId}))},null,2));if(!rows.length)throw Error('SDK did not return image');console.log('LIVE_FIXTURE_OK',rows.map(a=>a.width+'x'+a.height));}finally{db.sqlite.close();for(const f of files)await rm(f,{force:true});await rm(folder,{recursive:true,force:true});}`;
await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' },
  outfile: file,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
});
const child = spawn(process.execPath, [file], { stdio: 'inherit' });
const code = await new Promise((resolve) => child.on('exit', resolve));
await rm(file, { force: true });
if (code !== 0) process.exitCode = 1;
