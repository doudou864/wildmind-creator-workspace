import { test, expect } from 'vitest';
import { CollectionSession, AttentionRequired } from './collection-session';
test('验证码和异常登录停止平台，离线不输出任何识别结果', async () => {
  const snapshot = {
    url: 'https://creator.douyin.com/creator-micro/content/manage',
    text: '请拖动滑块完成验证',
    scroll: { top: 0, height: 600, total: 1000 },
    titles: [],
  };
  const session = new CollectionSession(14, 'p1', async () => snapshot);
  await expect(session.inspect('douyin')).rejects.toBeInstanceOf(AttentionRequired);
  const offline = new CollectionSession(14, 'p1', async () => {
    throw new Error('网络已断开');
  });
  await expect(offline.inspect('douyin')).rejects.toThrow('网络已断开');
  const login = new CollectionSession(14, 'p1', async () => ({ ...snapshot, text: '扫码登录' }));
  await expect(login.inspect('douyin')).rejects.toThrow('登录失效');
});
