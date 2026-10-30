import { expect, test } from 'vitest';
import { contentRows } from './content-rows';
import { PageCoverage } from '../pagination';
test('草稿计入页面总数但不当作已发布作品，避免空链接导致整轮失败', () => {
  const rows = contentRows(
    [
      { title: '新草稿', href: '', date: '', text: '新草稿\n草稿\n编辑草稿' },
      { title: '视频', href: '/video/a/edit', date: '2026年10月23日', text: '视频\n公开' },
    ],
    '草稿',
  );
  expect(rows.published).toHaveLength(1);
  expect(new PageCoverage().add(rows.keys, 2)).toBe(true);
});
test('不能将没有链接的公开作品悄悄当草稿跳过', () => {
  expect(() => contentRows([{ title: '公开视频', href: '', date: '', text: '公开视频\n公开' }], '草稿')).toThrow(
    '链接缺失',
  );
});
test('标题恰好叫草稿的已发布作品不能误排除', () => {
  const rows = contentRows(
    [{ title: '草稿', href: '/video/a/edit', date: '2026年10月23日', text: '草稿\n公开' }],
    '草稿',
  );
  expect(rows.published).toHaveLength(1);
  expect(rows.drafts).toHaveLength(0);
});
