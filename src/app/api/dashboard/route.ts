import { readDashboard } from '@/lib/workspace-service';
export async function GET(){return Response.json(await readDashboard());}
