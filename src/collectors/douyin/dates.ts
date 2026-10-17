import type { CollectionSession } from '../../browser/collection-session.ts';
import type { DouyinConfig } from './config.ts';
export async function selectAccountDate(session: CollectionSession, config: DouyinConfig, requestedDate: string) {
  for (const index of [0, 1]) {
    await session.click(`${config.accountCalendarSelector} >> nth=${index}`);
    const selector = `loc=role:gridcell[name="${requestedDate}"]`;
    for (let month = 0; month < config.calendarMonthLimit; month++) {
      const visible = await session.run<boolean>(
        `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(date=>!!document.querySelector('[role="gridcell"][aria-label="'+date+'"]'),${JSON.stringify(requestedDate)})));`,
      );
      if (visible) break;
      await session.click(`${config.previousMonthSelector} >> nth=0`);
    }
    await session.click(selector);
    await session.click(selector);
  }
}
