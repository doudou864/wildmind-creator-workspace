import { usingDatabase } from '@/lib/media-store';
import { runImageChat, recoverStoppedStudioChats } from '@/lib/image-chat-store';
import { CHAT_INSTRUCTIONS } from '@/ai/image-chat';
import { loadImageChatSkills } from '@/lib/image-chat-skills';
import { z } from 'zod';
import { imageChatTurns, imageStudioTurns } from '@/db/schema';
import { eq, asc } from 'drizzle-orm';
export const maxDuration = 600;
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const sessionId = query.get('session');
  if (sessionId && !z.uuid().safeParse(sessionId).success) return Response.json({ error: '无效会话' }, { status: 400 });
  const table = sessionId ? imageStudioTurns : imageChatTurns;
  return Response.json({
    instructions: CHAT_INSTRUCTIONS,
    skills: (await loadImageChatSkills()).map(({ instructions, ...skill }) => skill),
    turns: await usingDatabase(async (db) => {
      if (sessionId) await recoverStoppedStudioChats(db);
      return db.db
        .select()
        .from(table)
        .where(eq(table.contentId, sessionId ?? query.get('content') ?? ''))
        .orderBy(asc(table.createdAt))
        .all();
    }),
  });
}

export async function POST(request: Request) {
  const input = await request.json();
  let cancelled = false;
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (value: unknown) => {
          if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
        };
        try {
          const turn = await usingDatabase((db) => runImageChat(db, input, (text) => send({ type: 'text', text })));
          send({ type: 'done', turn });
        } catch (e) {
          send({ type: 'error', error: e instanceof Error ? e.message : String(e) });
        } finally {
          if (!cancelled) controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } },
  );
}
