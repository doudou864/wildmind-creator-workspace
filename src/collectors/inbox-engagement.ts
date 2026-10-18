import { z } from 'zod';
import type { Judgment } from '../ai/structured.ts';
/** 只认截图里属于同一条评论的数字；正文、整条作品数据和看不到的楼层都不能代替。 */
export async function readCommentEngagement(
  judgment: Judgment,
  image: string,
  rows: { author: string; body: string }[],
) {
  if (!rows.length) return [];
  const schema = z.object({
    items: z.array(
      z.object({
        key: z.enum(rows.map((_, i) => String(i))),
        likes: z.number().int().nonnegative().nullable(),
        replyCount: z.number().int().nonnegative().nullable(),
      }),
    ),
  });
  const result = schema.parse(
    await judgment.read(
      schema,
      '提取截图中各评论自身的点赞数、楼层回复数。用作者和正文匹配，匹配不唯一、未出现在截图、未显示数字、缩写或数字不清均返回null，不能填0或猜数。不要用作品总点赞、正文提到的数字或其他评论的数据。每个输入key必须返回且只返回一次。\n' +
        JSON.stringify(rows.map((r, i) => ({ key: String(i), author: r.author, body: r.body }))),
      [image],
    ),
  );
  if (result.items.length !== rows.length || new Set(result.items.map((r) => r.key)).size !== rows.length)
    throw Error('评论互动数字与原消息不一一对应');
  return rows.map((_, i) => {
    const row = result.items.find((r) => r.key === String(i))!;
    return { likes: row.likes, replyCount: row.replyCount };
  });
}
