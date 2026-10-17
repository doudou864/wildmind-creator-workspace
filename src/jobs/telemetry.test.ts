import { expect, it } from 'vitest';
import { beginTelemetry, countAI, countPage, reusedScreenshots } from './telemetry.ts';
it('作品关联判断不冒充截图识别，复用截图不冒充重新开页', () => {
  const run = beginTelemetry(true);
  countAI(false);
  countAI(true);
  countPage();
  reusedScreenshots();
  expect(run).toEqual({ delayed: true, reusedScreenshots: true, pages: 1, aiCalls: 2, aiReads: 1, attention: false });
});
