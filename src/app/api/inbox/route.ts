import { readInbox } from '@/lib/workspace-service';
export async function GET() {
  return Response.json(await readInbox());
}
