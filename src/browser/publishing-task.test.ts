import { beforeEach, expect, test, vi } from 'vitest';
import { runEgo } from './ego';
import { continuePublishingBrowser, closePublishingBrowser } from './publishing-task';

vi.mock('./ego', () => ({ runEgo: vi.fn() }));
const browser = { spaceId: 34, name: 'fixture-upload' };
const task = { name: browser.name, finish: vi.fn() };
const claim = vi.fn(async () => task),
  takeover = vi.fn(async () => task),
  resume = vi.fn(async () => task);
let spaces: { id: number; name: string; ownership: string }[];
beforeEach(() => {
  vi.clearAllMocks();
  spaces = [{ id: 34, name: browser.name, ownership: 'agent' }];
  vi.mocked(runEgo).mockImplementation(async (script) => {
    let result: unknown;
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    await new AsyncFunction('listTaskSpaces', 'claimTaskSpace', 'takeOverTaskSpace', 'taskSpace', 'console', script)(
      async () => spaces,
      claim,
      takeover,
      resume,
      {
        log: (line: string) => {
          result = JSON.parse(line.slice('WORKSPACE_RESULT:'.length));
        },
      },
    );
    return result;
  });
});
test('本人继续只接回登记的原空间；用户接管和任务暂停分别恢复，不新建', async () => {
  await continuePublishingBrowser(browser);
  expect(resume).toHaveBeenCalledWith(34);
  spaces[0].ownership = 'user';
  await continuePublishingBrowser(browser);
  expect(claim).toHaveBeenCalledWith(34);
  spaces[0].ownership = 'agent';
  await continuePublishingBrowser({ ...browser, pausedByTask: true });
  expect(takeover).toHaveBeenCalledWith(34);
  expect(task.finish).not.toHaveBeenCalled();
});
test('原空间已关闭给出重建入口，删除视为已经清理，绝不接管其他空间', async () => {
  spaces = [{ id: 99, name: 'other-task', ownership: 'user' }];
  await expect(continuePublishingBrowser(browser)).rejects.toThrow('重建浏览器并继续上传');
  await closePublishingBrowser(browser);
  expect(claim).not.toHaveBeenCalled();
  expect(resume).not.toHaveBeenCalled();
  expect(task.finish).not.toHaveBeenCalled();
});
test('同编号但身份不符时拒绝操作', async () => {
  spaces[0].name = 'another-task';
  await expect(continuePublishingBrowser(browser)).rejects.toThrow('身份不符');
  expect(resume).not.toHaveBeenCalled();
});
