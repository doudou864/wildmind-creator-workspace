import { readDeals } from '@/lib/workspace-service';
export async function GET() {
  return Response.json(await readDeals());
}
