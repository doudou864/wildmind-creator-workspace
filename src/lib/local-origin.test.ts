import { expect, test } from 'vitest';
import { isLocalOrigin } from './local-origin';
const request = (origin?: string, host = '127.0.0.1:3000') =>
  new Request('http://localhost:3000/api/collection', { headers: { host, ...(origin ? { origin } : {}) } });
test('框架把内部 URL 改成 localhost 时，浏览器的本机同源请求仍可启动', () => {
  expect(isLocalOrigin(request('http://127.0.0.1:3000'))).toBe(true);
  expect(isLocalOrigin(request('http://localhost:3000', 'localhost:3000'))).toBe(true);
  expect(isLocalOrigin(request('http://[::1]:3000', '[::1]:3000'))).toBe(true);
});
test('外站、不同端口、缺少来源依然不能启动本机任务', () => {
  for (const origin of ['https://example.com', 'http://127.0.0.1:4000', 'null', undefined])
    expect(isLocalOrigin(request(origin))).toBe(false);
  expect(isLocalOrigin(request('https://example.com', 'example.com'))).toBe(false);
});
