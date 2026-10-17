import { test, expect } from 'vitest';
import { PageCoverage, batches } from './pagination';
test('超过默认10条分批全部保留，不截断第11条和最后一批', () => {
  const works = Array.from({ length: 23 }, (_, i) => `work-${i}`);
  const groups = batches(works, 10);
  expect(groups.map((x) => x.length)).toEqual([10, 10, 3]);
  expect(groups.flat()).toEqual(works);
});
test('分页必须推进并核对总量，不能把重复第一页当第二页', () => {
  const c = new PageCoverage();
  expect(c.add(['a', 'b'], 3)).toBe(false);
  expect(c.add(['c'], 3)).toBe(true);
  expect(() => c.finish()).not.toThrow();
  const repeated = new PageCoverage();
  repeated.add(['a', 'b'], 3);
  expect(() => repeated.add(['a', 'b'], 3)).toThrow('未推进');
  const missing = new PageCoverage();
  missing.add(['a'], 2);
  expect(() => missing.finish()).toThrow('未读全');
  expect(() => missing.add(['b'], 3)).toThrow('总数');
});
