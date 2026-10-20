import { usingDatabase } from '@/lib/media-store';
import { runImageChat } from '@/lib/image-chat-store';
import { CHAT_INSTRUCTIONS } from '@/ai/image-chat';
import { imageChatTurns } from '@/db/schema';
import { eq } from 'drizzle-orm';
export const maxDuration = 600;
export async function GET(request: Request) {
  const contentId = new URL(request.url).searchParams.get('content') ?? '';
  return Response.json({
    instructions: CHAT_INSTRUCTIONS,
    turns: await usingDatabase((db) =>
      db.db.select().from(imageChatTurns).where(eq(imageChatTurns.contentId, contentId)).all(),
    ),
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
