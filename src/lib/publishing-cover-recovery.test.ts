import { expect, test } from 'vitest';
import {
  beginCoverRecovery,
  clearCoverRecovery,
  coverRecoveryKey,
  readCoverRecovery,
  type PendingCoverHandoff,
} from './publishing-cover-recovery';

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}
const pending: PendingCoverHandoff = {
  version: 1,
  assetId: 'fixture-cover',
  targetBatchId: null,
  title: '待核对的视频主题',
  ratio: '3:4',
  topicId: 'fixture-topic',
  startedAt: '2026-10-30T00:00:00Z',
};

test('保存发出前持久记录，刷新重新读取仍阻止同张封面重复新建', () => {
  const local = storage();
  expect(readCoverRecovery(local, pending.assetId)).toEqual({ status: 'clear' });
  beginCoverRecovery(local, pending);
  expect(readCoverRecovery(local, pending.assetId)).toEqual({ status: 'pending', pending });
  expect(() => beginCoverRecovery(local, pending)).toThrow('尚未核对');
  expect(readCoverRecovery(local, pending.assetId)).toEqual({ status: 'pending', pending });
});

test('按封面隔离记录，另一张封面仍可交接，旧标记不被替换', () => {
  const local = storage();
  beginCoverRecovery(local, pending);
  const second = { ...pending, assetId: 'another-cover', targetBatchId: 'fixture-batch' };
  beginCoverRecovery(local, second);
  expect(readCoverRecovery(local, pending.assetId)).toEqual({ status: 'pending', pending });
  expect(readCoverRecovery(local, second.assetId)).toEqual({ status: 'pending', pending: second });
});

test('存储写入失败必须抛错以阻断后续请求；不能伪造已记录', () => {
  const local = storage();
  let sent = false;
  expect(() => {
    beginCoverRecovery(
      {
        ...local,
        setItem: () => {
          throw Error('quota');
        },
      },
      pending,
    );
    sent = true;
  }).toThrow('尚未发送');
  expect(sent).toBe(false);
  expect(readCoverRecovery(local, pending.assetId).status).toBe('clear');
});

test('存储不可读、损坏或来源不符一律待核对，不能当成未保存自动重试', () => {
  const local = storage();
  expect(
    readCoverRecovery(
      {
        ...local,
        getItem: () => {
          throw Error('blocked');
        },
      },
      pending.assetId,
    ).status,
  ).toBe('unreadable');
  local.setItem(coverRecoveryKey(pending.assetId), '{broken');
  expect(readCoverRecovery(local, pending.assetId).status).toBe('unreadable');
  expect(() => beginCoverRecovery(local, pending)).toThrow('尚未核对');
  local.setItem(coverRecoveryKey(pending.assetId), JSON.stringify({ ...pending, assetId: 'other' }));
  expect(readCoverRecovery(local, pending.assetId).status).toBe('unreadable');
});

test('单纯读取不清除结果未知的记录，只有确认成功或用户核对后调用清除才允许重新带入', () => {
  const local = storage();
  beginCoverRecovery(local, pending);
  readCoverRecovery(local, pending.assetId);
  readCoverRecovery(local, pending.assetId);
  expect(readCoverRecovery(local, pending.assetId).status).toBe('pending');
  clearCoverRecovery(local, pending.assetId);
  expect(readCoverRecovery(local, pending.assetId).status).toBe('clear');
  beginCoverRecovery(local, pending);
  expect(readCoverRecovery(local, pending.assetId).status).toBe('pending');
});

test('清除未成功不能假装恢复完成，更不能发送第二次', () => {
  const local = storage();
  beginCoverRecovery(local, pending);
  expect(() => clearCoverRecovery({ ...local, removeItem: () => {} }, pending.assetId)).toThrow('不会重新发送');
  expect(readCoverRecovery(local, pending.assetId).status).toBe('pending');
});
