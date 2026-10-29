import type { CollectionSession } from '../../browser/collection-session.ts';
export async function revealContact(session: CollectionSession, selector: string, scroll: string, maxScrolls: number) {
  for (let step = 0; step <= maxScrolls; step++) {
    const direction = await session.run<number>(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(({selector,scroll})=>{const e=document.querySelector(selector),box=document.querySelector(scroll);if(!e||!box)throw Error('私信会话或滚动区域不存在');const r=e.getBoundingClientRect(),b=box.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;if(y>=Math.min(b.bottom,innerHeight)-10)return 1;if(y<=Math.max(b.top,0)+10)return -1;if(!e.contains(document.elementFromPoint(x,y)))throw Error('私信会话被遮挡，未点击');return 0;},${JSON.stringify({ selector, scroll })})));`,
    );
    if (direction === 0) return;
    if (step === maxScrolls) throw Error('私信会话滚动后仍不可见，未点击');
    await session.scroll(scroll, direction);
  }
}
