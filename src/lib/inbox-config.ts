import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { inboxConfigSchema } from './inbox-model';
export async function loadInboxConfig(){return inboxConfigSchema.parse(parse(await readFile(path.join(process.cwd(),'config/inbox.yaml'),'utf8')));}
