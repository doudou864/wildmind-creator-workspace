import { usingDatabase } from '@/lib/media-store';
import { latestTopicTask } from '@/jobs/topic-task-state';
import { loadConfig } from '@/lib/config';
import { startTopicGeneration } from '@/jobs/topic-generation';
import { serviceError } from '@/lib/api-response';
import { isLocalOrigin } from '@/lib/local-origin';
import { z } from 'zod';
export async function POST(request: Request) {
  if (!isLocalOrigin(request)) return Response.json({ error: '请从本机工作台启动选题采集' }, { status: 403 });
  try {
    const text = await request.text();
    const input = z
      .object({ revision: z.string().optional() })
      .strict()
      .parse(text ? JSON.parse(text) : {});
    return Response.json(await usingDatabase((db) => startTopicGeneration(db, undefined, input.revision)), {
      status: 202,
    });
  } catch (error) {
    return serviceError(error);
  }
}

export const dynamic = 'force-dynamic';
export async function GET() {
  const config = await loadConfig();
  return Response.json({ task: await usingDatabase((db) => latestTopicTask(db, config.parameters.topicStartupMs)) });
}
