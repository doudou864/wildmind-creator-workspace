import { writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { openDatabase } from '../src/db/database.ts';
import { loadConfig } from '../src/lib/config.ts';
import { loadDataCenterConfig } from '../src/lib/data-center-config.ts';
import { dataCenterData } from '../src/lib/data-center-store.ts';
const db = openDatabase();
try {
  const config = await loadConfig(),
    settings = await loadDataCenterConfig();
  const all = dataCenterData(db, config, settings);
  const choices = [
    ...all.posts.filter((p) => p.form === '视频').slice(0, 2),
    ...all.posts.filter((p) => p.form === '图文').slice(0, 1),
  ];
  assert.equal(choices.length, 3);
  const snapshots = db.sqlite.prepare('select id,post_id,metric_id,captured_at,value from post_snapshots').all();
  const stamp = (p) => Date.parse(p.publishedAt.length === 10 ? p.publishedAt + 'T00:00:00+08:00' : p.publishedAt);
  const report = [];
  for (const post of choices) {
    const page = dataCenterData(db, config, settings, post.id),
      day = page.checkpoints.filter((d) => d <= page.age).at(-1);
    const pick = (p, limit) =>
      snapshots
        .filter(
          (s) =>
            s.post_id === p.id &&
            s.metric_id === p.metricId &&
            s.value !== null &&
            Date.parse(s.captured_at) >= stamp(p) + day * 86400000 &&
            Date.parse(s.captured_at) <= limit,
        )
        .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at) || a.id.localeCompare(b.id))[0];
    const own = pick(post, Date.now()),
      cutoff = own ? Date.parse(own.captured_at) : Date.now();
    const peers = all.posts
      .filter((p) => p.id !== post.id && p.form === post.form && stamp(p) < stamp(post))
      .sort((a, b) => stamp(b) - stamp(a))
      .map((p) => ({ id: p.id, sample: pick(p, cutoff) }))
      .filter((p) => p.sample)
      .slice(0, config.parameters.baselineSamples);
    const values = peers.map((p) => p.sample.value).sort((a, b) => a - b);
    const q = (p) => {
      if (values.length < config.parameters.baselineMinimum) return null;
      const x = (values.length - 1) * p,
        a = Math.floor(x);
      return values[a] + (values[Math.ceil(x)] - values[a]) * (x - a);
    };
    const row = page.comparisons[day].find((r) => r.id === post.metricId);
    assert.equal(row.value, own?.value ?? null);
    assert.equal(row.count, values.length);
    assert.equal(row.median, q(0.5));
    assert.equal(row.p25, q(0.25));
    assert.equal(row.p75, q(0.75));
    assert.equal(row.conclusion, null);
    const missingDays = [];
    page.curve.forEach((r, i) => {
      const actual = snapshots
        .filter(
          (s) =>
            s.post_id === post.id &&
            s.metric_id === post.metricId &&
            s.value !== null &&
            Math.floor((Date.parse(s.captured_at) - stamp(post)) / 86400000) === i + 1,
        )
        .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at))[0];
      assert.equal(r.value, actual?.value ?? null);
      if (!actual && i + 1 <= page.age) missingDays.push(i + 1);
    });
    report.push({
      id: post.id,
      title: post.title,
      form: post.form,
      day,
      value: row.value,
      actualDay: row.actualDay,
      comparisonValues: values,
      sampleCount: row.count,
      median: row.median,
      p25: row.p25,
      p75: row.p75,
      status: row.status,
      missingDays,
    });
  }
  await mkdir('data/verification', { recursive: true });
  await writeFile('data/verification/data-center-real.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  db.sqlite.close();
}
