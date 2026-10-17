import { runCollection } from '../src/jobs/collect.ts';
const mode = process.argv.includes('--resume')
  ? 'resume'
  : process.argv.includes('--scheduled')
    ? 'scheduled'
    : 'manual';
await runCollection(mode, process.env.WORKSPACE_EGO_SPACE ? Number(process.env.WORKSPACE_EGO_SPACE) : undefined);
