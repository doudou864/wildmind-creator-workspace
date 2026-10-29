import { test, expect } from 'vitest';
import { visualLogin } from './visual-login';
import type { CollectionSession } from './collection-session';
import type { Judgment } from '../ai/structured';
test('视觉核验使用当前截图：旧登录错误不覆盖新证据，微信登录页仍保留确认流程', async () => {
  const paths: string[] = [];
  const session = {
    run: async () => 'https://channels.weixin.qq.com/platform',
    capture: async () => '',
  } as unknown as CollectionSession;
  const prior = {
    platformId: 'channels',
    state: 'unknown' as const,
    reason: '旧错误',
    checkedAt: 'old',
    statePath: null,
  };
  let state = 'logged_in';
  const judge = { read: async () => ({ state, evidence: 'fixture可见后台账号' }) } as unknown as Judgment;
  expect((await visualLogin('channels', session, judge, 'data/fixture.png', paths, prior)).state).toBe('logged_in');
  state = 'logged_out';
  expect((await visualLogin('channels', session, judge, 'data/fixture.png', paths, prior)).state).toBe(
    'awaiting_confirmation',
  );
  state = 'verification';
  const blocked = await visualLogin('channels', session, judge, 'data/fixture.png', paths, prior);
  expect(blocked.state).toBe('unknown');
  expect(blocked.reason).toContain('需要处理：');
});
