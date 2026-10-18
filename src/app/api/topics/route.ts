import { readTopics } from '@/lib/workspace-service';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(await readTopics());
}
