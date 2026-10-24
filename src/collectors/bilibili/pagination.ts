import type { CollectionSession } from '../../browser/collection-session.ts';

type CommentPagination = {
  row: string;
  author: string;
  body: string;
  time: string;
  title: string;
  next: string;
  currentPage: string;
  pageReadyTimeoutMs: number;
};

export async function advanceCommentPage(session: CollectionSession, cfg: CommentPagination, fingerprint: string) {
  const current = await session.run<number>(
    `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(selector=>Number(document.querySelector(selector)?.textContent.trim()),${JSON.stringify(cfg.currentPage)})));`,
  );
  if (!Number.isInteger(current) || current < 1) throw Error('评论当前页码无法识别，未继续翻页');
  await session.click(cfg.next);
  // A click receipt or a changed page number alone does not mean the new comments have arrived.
  const ready = await session.run<boolean>(
    `try{await page.waitForFunction(({cfg,current,fingerprint})=>{const rows=Array.from(document.querySelectorAll(cfg.row)).map(e=>({author:e.querySelector(cfg.author)?.textContent.trim()??'',body:e.querySelector(cfg.body)?.textContent.trim()??'',time:e.querySelector(cfg.time)?.textContent.trim()??'',title:e.querySelector(cfg.title)?.textContent.trim()??''}));return Number(document.querySelector(cfg.currentPage)?.textContent.trim())===current+1&&rows.length>0&&JSON.stringify(rows)!==fingerprint;},${JSON.stringify({ cfg, current, fingerprint })},{timeout:${cfg.pageReadyTimeoutMs}});console.log('WORKSPACE_RESULT:true');}catch(e){if(!/timeout/i.test(String(e)))throw e;console.log('WORKSPACE_RESULT:false');}`,
  );
  if (!ready) {
    await session.inspect('bilibili');
    throw Error(`评论翻页等待超时：第${current}页点击下一页后，页码或评论内容未更新；未标记完整`);
  }
}
