import { readTopics } from '@/lib/workspace-service';
export async function GET(){return Response.json(await readTopics());}
