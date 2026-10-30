import { readTopicSkill, saveTopicSkill } from '@/lib/topic-skill';
import { isLocalOrigin } from '@/lib/local-origin';
import { serviceError } from '@/lib/api-response';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json(await readTopicSkill());
  } catch (error) {
    return serviceError(error);
  }
}
export async function PUT(request: Request) {
  if (!isLocalOrigin(request)) return Response.json({ error: '请从本机工作台编辑 Skill' }, { status: 403 });
  try {
    return Response.json(await saveTopicSkill(await request.json()));
  } catch (error) {
    return serviceError(error);
  }
}
