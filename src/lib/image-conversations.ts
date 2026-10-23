import { eq, asc } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceDatabase } from '../db/database';
import { imageStudioChats, imageStudioTurns } from '../db/schema';
export type ImageConversation = { id: string; title: string; archived: boolean; updatedAt: string; running: boolean };
export function readImageConversations(db: WorkspaceDatabase): ImageConversation[] {
  const chats = db.db.select().from(imageStudioChats).all();
  const turns = db.db.select().from(imageStudioTurns).orderBy(asc(imageStudioTurns.createdAt)).all();
  const ids = new Set([...chats.map((c) => c.contentId), ...turns.map((t) => t.contentId)]);
  return [...ids]
    .map((id) => {
      const chat = chats.find((c) => c.contentId === id),
        history = turns.filter((t) => t.contentId === id);
      return {
        id,
        title: chat?.title || history[0]?.input.trim().split('\n')[0].slice(0, 48) || '新对话',
        archived: chat?.archived ?? false,
        updatedAt: [chat?.updatedAt ?? '', ...history.map((t) => t.updatedAt)].sort().at(-1) ?? '',
        running: history.some((t) => t.status === 'running'),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id: z.uuid() }).strict(),
  z.object({ action: z.literal('rename'), id: z.uuid(), title: z.string().trim().min(1).max(100) }).strict(),
  z.object({ action: z.enum(['archive', 'restore']), id: z.uuid() }).strict(),
]);
export function manageImageConversation(db: WorkspaceDatabase, raw: unknown) {
  const input = actionSchema.parse(raw),
    now = new Date().toISOString();
  return db.db.transaction((tx) => {
    const old = tx.select().from(imageStudioChats).where(eq(imageStudioChats.contentId, input.id)).get();
    const turn = tx.select().from(imageStudioTurns).where(eq(imageStudioTurns.contentId, input.id)).get();
    if (input.action === 'create') {
      tx.insert(imageStudioChats).values({ contentId: input.id, updatedAt: now }).onConflictDoNothing().run();
    } else {
      if (!old && !turn) throw Error('对话不存在，请刷新后重试。');
      if (
        input.action === 'archive' &&
        tx
          .select()
          .from(imageStudioTurns)
          .all()
          .some((t) => t.contentId === input.id && t.status === 'running')
      )
        throw Error('这条对话仍在生成，完成后可归档。');
      const changes = input.action === 'rename' ? { title: input.title } : { archived: input.action === 'archive' };
      tx.insert(imageStudioChats)
        .values({ contentId: input.id, updatedAt: now, ...changes })
        .onConflictDoUpdate({ target: imageStudioChats.contentId, set: { ...changes, updatedAt: now } })
        .run();
    }
    return readImageConversations(db).find((c) => c.id === input.id)!;
  });
}
