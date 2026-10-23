import { afterEach, expect, test, vi } from 'vitest';
import { channelsActionsScript } from './channels-publishing';

afterEach(() => vi.unstubAllGlobals());
test('视频号只点击唯一可用的可见发表按钮；隐藏、歧义和禁用不能导致误发', async () => {
  const element = (width: number, disabled = false) => ({
    textContent: '发表',
    ownerDocument: { defaultView: null },
    disabled,
    getAttribute: () => null,
    classList: { contains: () => false },
    scrollIntoView: vi.fn(),
    getBoundingClientRect: () => ({ x: 20, y: 30, width, height: 40 }),
  });
  const visible = element(100),
    hidden = element(0);
  let buttons = [hidden, visible];
  const contentDocument = { querySelectorAll: () => buttons };
  vi.stubGlobal('document', {
    querySelectorAll: (selector: string) => (selector === 'iframe' ? [{ contentDocument }] : []),
  });
  const click = vi.fn();
  const run = () =>
    new Function('p', `return (async()=>{${channelsActionsScript};await channelsClick('button','发表');})()`)({
      evaluate: (fn: (args: unknown) => unknown, args: unknown) => fn(args),
      mouse: { click },
    });
  await run();
  expect(click).toHaveBeenCalledExactlyOnceWith(70, 50);
  buttons = [visible, element(100)];
  await expect(run()).rejects.toThrow('无法唯一识别');
  buttons = [element(100, true)];
  await expect(run()).rejects.toThrow('尚未可用');
  expect(click).toHaveBeenCalledTimes(1);
});
