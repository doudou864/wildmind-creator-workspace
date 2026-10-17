import { describe, expect, test } from 'vitest';
import { detectLogin, loadBrowserConfig } from './config';
import { EgoBrowser } from './ego';
describe('真实后台登录检查', () => {
  test('网址或菜单单独存在都不代表已登录；矛盾状态保持未知', async () => {
    const [douyin] = await loadBrowserConfig();
    expect(detectLogin(douyin, 'https://creator.douyin.com/creator-micro/home', '抖音号 粉丝指数').state).toBe(
      'logged_in',
    );
    expect(detectLogin(douyin, 'https://creator.douyin.com/creator-micro/home', '作品发布 数据中心').state).toBe(
      'unknown',
    );
    expect(detectLogin(douyin, 'https://example.com/creator-micro/home', '抖音号 粉丝指数').state).toBe('unknown');
    expect(detectLogin(douyin, douyin.url, '扫码登录').state).toBe('logged_out');
    expect(detectLogin(douyin, 'https://creator.douyin.com/creator-micro/home', '抖音号 粉丝指数 扫码登录').state).toBe(
      'unknown',
    );
  });
  test('没实测过登录后页面不能猜成功', async () => {
    const config = (await loadBrowserConfig()).find((p) => p.id === 'channels')!;
    expect(detectLogin({ ...config, loggedIn: [], loggedInPath: null }, config.url, '首页 数据中心').state).toBe(
      'unknown',
    );
    expect(detectLogin(config, config.url, '登录视频号助手').state).toBe('awaiting_confirmation');
  });
  test('视频号须同时核对后台地址和已实测的账号区域', async () => {
    const config = (await loadBrowserConfig()).find((p) => p.id === 'channels')!;
    expect(detectLogin(config, 'https://channels.weixin.qq.com/platform', '视频号ID: 关注者 昨日数据').state).toBe(
      'logged_in',
    );
    expect(detectLogin(config, config.url, '登录视频号助手 微信快捷登录').state).toBe('awaiting_confirmation');
    expect(detectLogin(config, 'https://channels.weixin.qq.com/platform', '昨日数据').state).toBe('unknown');
  });
  test('控制权/CLI错误时停止后续浏览，不自动重试', async () => {
    const scripts: string[] = [];
    const browser = new EgoBrowser(process.cwd(), async (script) => {
      scripts.push(script);
      if (scripts.length === 1) return 12;
      throw new Error('控制权已交给用户');
    });
    const results = await browser.checkLogins(['douyin', 'xiaohongshu']);
    expect(scripts).toHaveLength(2);
    expect(results.every((r) => r.state === 'unknown')).toBe(true);
  });
  test('全部检查复用一个空间，保存资料不输出 Cookie', async () => {
    const scripts: string[] = [];
    const browser = new EgoBrowser(process.cwd(), async (script) => {
      scripts.push(script);
      if (scripts.length === 1) return 12;
      if (script.includes('await t.finish')) return true;
      return { url: 'https://creator.douyin.com/creator-micro/home', positive: ['抖音号', '粉丝指数'], negative: [] };
    });
    const results = await browser.checkLogins(['douyin']);
    expect(results[0].state).toBe('logged_in');
    expect(scripts[1]).toContain('mode:0o600');
    expect(scripts[1]).not.toContain('Network.setCookies');
    expect(scripts[1]).not.toContain('addScriptToEvaluateOnNewDocument');
    expect(scripts[1]).not.toContain('console.log(cookies)');
    expect(scripts[2]).toContain('finish({keep:[]})');
  });
});

test('微信确认按钮只在尚未登录时点击，不输入密码，不注入登录资料', async () => {
  let script = '';
  const browser = new EgoBrowser(process.cwd(), async (value) => {
    script = value;
    return { url: 'https://channels.weixin.qq.com/', positive: [], negative: ['登录视频号助手'] };
  });
  const result = await browser.requestConfirmation('channels', 14);
  expect(result.state).toBe('awaiting_confirmation');
  expect(script).toContain('微信快捷登录');
  expect(script).toContain('if(!verified(before))');
  expect(script).not.toContain('Network.setCookies');
  expect(script).not.toContain('.fill(');
});
