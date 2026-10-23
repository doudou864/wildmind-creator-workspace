import { usingDatabase } from '@/lib/media-store';
import { readImageConversations, manageImageConversation } from '@/lib/image-conversations';
import { recoverStoppedStudioChats } from '@/lib/image-chat-store';
import { serviceError } from '@/lib/api-response';
export async function GET() {
  try {
    return Response.json(
      await usingDatabase(async (db) => {
        await recoverStoppedStudioChats(db);
        return { sessions: readImageConversations(db) };
      }),
    );
  } catch (e) {
    return serviceError(e);
  }
}
export async function POST(request: Request) {
  try {
    const input = await request.json();
    return Response.json(await usingDatabase((db) => manageImageConversation(db, input)));
  } catch (e) {
    return serviceError(e);
  }
}
