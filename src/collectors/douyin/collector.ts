import { reusedScreenshots } from '../../jobs/telemetry.ts';
import { writeFile, readFile, rename, mkdir } from 'node:fs/promises';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Judgment } from '../../ai/structured.ts';
import { CollectionSession } from '../../browser/collection-session.ts';
import { shanghaiDate } from '../../browser/policy.ts';
import type { WorkspaceDatabase } from '../../db/database.ts';
import { posts } from '../../db/schema.ts';
import { loadConfig } from '../../lib/config.ts';
import {
  ageInDays,
  detailCheckpoints,
  groupSources,
  normalizeTitle,
  matchPost,
  sinceStartDate,
  withinRecentWindow,
  missingAccountDates,
  normalizeDataDate,
} from '../../core/collection.ts';
import { screenshotReading } from '../recognition.ts';
import { readState, writeState } from '../state.ts';
import {
  postKey,
  metricFor,
  persistCollection,
  prepareAssociations,
  type CollectedPost,
  type CapturedReading,
} from '../storage.ts';
import { loadDouyinConfig } from './config.ts';
import { selectAccountDate } from './dates.ts';
import { missingDailyPostMetrics } from '../validate.ts';
export async function collectDouyin(
  database: WorkspaceDatabase,
  session: CollectionSession,
  judgment: Judgment,
  archivePaths: string[],
  progress = (text: string) => console.log(text),
) {
  const config = await loadDouyinConfig();
  const workspace = await loadConfig();
  const now = new Date();
  const eligiblePost = (publishedAt: string) =>
    sinceStartDate(publishedAt, workspace.parameters.startDate, now) &&
    withinRecentWindow(publishedAt, now, workspace.parameters.recentWindow);
  const history = !readState(database, `${config.platformId}:history`)?.completed;
  const folder = `data/captures/${config.platformId}/${shanghaiDate(now)}/${randomUUID()}`;
  const readings: CapturedReading[] = [];
  const incoming = new Map<string, CollectedPost>();
  const completed: Record<string, number[]> = {};
  const recognized = new Set<string>();
  let sequence = 0;
  let accountDate: string | null = null;
  let monthly = false;
  const allowedMetrics = workspace.metrics
    .filter((m) =>
      m.bindings.some(
        (b) =>
          b.platformId === config.platformId && b.status === 'confirmed' && ['core', 'secondary'].includes(b.level),
      ),
    )
    .map((m) => ({
      name: m.name,
      scope: m.scope,
      forms: m.bindings.filter((b) => b.platformId === config.platformId).map((b) => b.form),
    }));
  async function capture(
    page: CollectionSession,
    kind: CapturedReading['kind'],
    context: string,
    post?: CollectedPost,
    archivePosts?: CollectedPost[],
  ) {
    const sourcePath = `${folder}/${String(sequence++).padStart(4, '0')}-${kind}.png`;
    await page.capture(sourcePath);
    archivePaths.push(sourcePath);
    const capturedAt = new Date().toISOString();
    const reading = archivePosts
      ? screenshotReading.parse({
          status: 'ok',
          reason: null,
          posts: archivePosts.map((p) => ({ ...p, metrics: [] })),
          account: { dataDate: null, metrics: [] },
          records: [],
          signals: [],
        })
      : await judgment.read(
          screenshotReading,
          `只按截图提取数据；不输出比较增减、排名、舍弃指标或估计值。raw保留单位和百分号；不要加法或单位换算。流量来源各行单独按原标签返回（包含${JSON.stringify(Object.values(config.sourceGroups).flat())}），归组由程序处理；数据不足为null。缺失不可见的指标不输出。没有相关数据时相应数组为空。失败填写reason。发布时间带+08:00；账号dataDate只写YYYY-MM-DD。只取“作品数据”和“粉丝数据”的指定日期账号指标，不取“数据总览”。原文记录只要诊断、性别/年龄/地域、观看时段、流量来源；不要设备/兴趣/评论热词。\n允许的数值指标：${JSON.stringify(allowedMetrics)}\n以下对应表中的平台原标签也属于允许指标，按截图原标签提取，由程序转换：${JSON.stringify(kind === 'account' ? config.accountAliases : config.aliases)}\n${context}`,
          [sourcePath],
        );
    await writeFile(
      sourcePath.replace('.png', '.json'),
      JSON.stringify({ capturedAt, method: archivePosts ? 'page_metadata' : 'vision', reading }, null, 2),
      {
        mode: 0o600,
      },
    );
    archivePaths.push(sourcePath.replace('.png', '.json'));
    if (kind === 'account') {
      if (monthly) {
        reading.account.metrics = [];
        reading.records = reading.records.filter((r) => ['audience', 'viewing_times'].includes(r.type));
      } else if (reading.account.metrics.length) {
        if (reading.account.dataDate && normalizeDataDate(reading.account.dataDate) !== accountDate)
          throw new Error('截图账号日期与页面标注冲突');
        reading.account.dataDate = accountDate;
      }
      reading.posts = [];
    } else {
      reading.account.metrics = [];
    }
    if (reading.status === 'failed') throw new Error(`截图识别失败：${reading.reason || '未提供原因'}`);
    if (kind === 'list') {
      for (const item of reading.posts) {
        const matched = matchPost([...incoming.values()], item);
        if (!matched) throw new Error('截图作品标题与页面列表无法对应');
        item.title = matched.title;
        item.publishedAt = matched.publishedAt;
        if (item.form !== matched.form) throw new Error('截图内容形式与列表标记冲突');
        if (item.metrics.length || (archivePosts && ageInDays(matched.publishedAt, now) > config.historyRange[1]))
          recognized.add(matched.key);
      }
    } else if (post) {
      for (const item of reading.posts) {
        item.title = post.title;
        item.publishedAt = post.publishedAt;
        item.form = post.form;
      }
    }
    if (kind === 'list') reading.posts = reading.posts.filter((p) => eligiblePost(p.publishedAt));
    for (const p of reading.posts)
      if (ageInDays(p.publishedAt, now) > workspace.parameters.recentWindow) p.metrics = [];
    readings.push({ sourcePath, capturedAt, reading, kind, postKey: post?.key });
    progress(`已核验截图 ${sequence}：${kind}`);
  }
  async function metadata() {
    return session.run<
      { title: string; date: string | null; form: '视频' | '图文' | null; pinned: boolean; visible: boolean }[]
    >(
      `console.log('WORKSPACE_RESULT:'+JSON.stringify(await page.evaluate(cfg=>Array.from(document.querySelectorAll(cfg.cardSelector)).map(card=>{const text=card.innerText;return {title:card.querySelector(cfg.titleSelector)?.textContent.trim()??'',date:text.match(/\\d{4}年\\d{2}月\\d{2}日 \\d{2}:\\d{2}/)?.[0]??null,form:/\\d+\\s*张/.test(text)?'图文':/(?:^|\\n)\\d{2}:\\d{2}(?:\\n|$)/.test(text)?'视频':null,pinned:text.startsWith('置顶'),visible:card.getBoundingClientRect().bottom>200&&card.getBoundingClientRect().top<innerHeight};}),${JSON.stringify(config)})));`,
    );
  }
  const saved = readState(database, `${config.platformId}:list-stage`);
  const stageSchema = z.object({
    date: z.string(),
    history: z.boolean(),
    posts: z.array(
      z.object({ key: z.string(), title: z.string(), publishedAt: z.string(), form: z.enum(['视频', '图文']) }),
    ),
    readings: z.array(
      z.object({
        sourcePath: z.string().startsWith('data/'),
        capturedAt: z.string(),
        reading: screenshotReading,
        kind: z.literal('list'),
      }),
    ),
  });
  let restored = false;
  if (
    saved?.date === shanghaiDate(now) &&
    typeof saved.path === 'string' &&
    saved.path.startsWith('data/captures/') &&
    !saved.path.includes('..')
  ) {
    const stage = stageSchema.parse(JSON.parse(await readFile(saved.path, 'utf8')));
    if (stage.date === shanghaiDate(now) && stage.history === history) {
      for (const p of stage.posts.filter((p) => eligiblePost(p.publishedAt))) {
        incoming.set(p.key, p);
        recognized.add(p.key);
      }
      const scopedReadings = stage.readings
        .map((r) => ({
          ...r,
          reading: {
            ...r.reading,
            posts: r.reading.posts.filter((p) => eligiblePost(p.publishedAt)),
          },
        }))
        .filter((r) => r.reading.posts.length);
      readings.push(...scopedReadings);
      archivePaths.push(
        saved.path,
        ...scopedReadings.flatMap((r) => [r.sourcePath, r.sourcePath.replace('.png', '.json')]),
      );
      sequence = scopedReadings.length;
      restored = true;
      reusedScreenshots();
      progress(`恢复已核验列表：${incoming.size} 条近期作品`);
    }
  }
  await session.navigate(config.listUrl, config.listReady);
  if (!restored) {
    let reachedEnd = false;
    let previousBottom = '';
    let stableBottom = 0;
    for (let i = 0; i < config.maxScreens; i++) {
      const observation = await session.inspect(config.platformId, config.listScroll, config.titleSelector);
      const cards = await metadata();
      for (const card of cards) {
        if (!card.title || !card.date || !card.form) throw new Error('列表标题/发布时间/形式无法识别');
        const publishedAt = card.date.replace(/(\d{4})年(\d{2})月(\d{2})日 (\d{2}:\d{2})/, '$1-$2-$3T$4:00+08:00');
        const key = postKey(config.platformId, card.title, publishedAt);
        incoming.set(key, { key, title: card.title, publishedAt, form: card.form });
      }
      // Stop at the first wholly old viewport; do not recognize or archive older works.
      if (
        cards.some((c) => !c.pinned && c.visible) &&
        cards
          .filter((c) => !c.pinned && c.visible)
          .every(
            (c) =>
              c.date &&
              ageInDays(c.date.replace(/(\d{4})年(\d{2})月(\d{2})日 (\d{2}:\d{2})/, '$1-$2-$3T$4:00+08:00'), now) >
                Math.min(
                  workspace.parameters.recentWindow,
                  Math.max(0, ageInDays(workspace.parameters.startDate + 'T00:00:00+08:00', now)),
                ),
          )
      ) {
        reachedEnd = true;
        break;
      }
      await capture(
        session,
        'list',
        `只提取完整可见卡片。标题优先从以下页面标题对应（不能借此推断数字）：${JSON.stringify(cards.map((c) => ({ title: c.title, form: c.form, date: c.date })))}`,
        undefined,
        history &&
          cards
            .filter((c) => c.visible)
            .every(
              (c) =>
                c.date &&
                ageInDays(c.date.replace(/(\d{4})年(\d{2})月(\d{2})日 (\d{2}:\d{2})/, '$1-$2-$3T$4:00+08:00'), now) >
                  config.historyRange[1],
            )
          ? [...incoming.values()].filter((p) =>
              cards.some(
                (c) =>
                  c.visible &&
                  normalizeTitle(c.title) === normalizeTitle(p.title) &&
                  c.date?.replace(/(\d{4})年(\d{2})月(\d{2})日 (\d{2}:\d{2})/, '$1-$2-$3T$4:00+08:00') ===
                    p.publishedAt,
              ),
            )
          : undefined,
      );
      const atBottom = observation.scroll.top + observation.scroll.height >= observation.scroll.total - 3;
      const signature = cards.map((c) => c.title).join('\n');
      if (atBottom) {
        stableBottom = signature === previousBottom ? stableBottom + 1 : 0;
        previousBottom = signature;
        if (stableBottom >= 2) {
          const total = Number(observation.text.match(/作品\s*\((\d+)\)/)?.[1]);
          if (!total || incoming.size !== total) throw new Error('历史列表数量与后台作品总数不一致，可能加载失败');
          reachedEnd = true;
          break;
        }
      }
      await session.scroll(config.listScroll);
    }
    if (!reachedEnd) throw new Error('列表未完整读取：达到截图上限，历史导入不标完成');
  }
  const all = [...incoming.values()];
  const target = all.filter((p) => eligiblePost(p.publishedAt));
  if (target.some((p) => !recognized.has(p.key))) throw new Error('部分作品没有完整的截图识别结果，停止入库');
  if (!restored) {
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const stagePath = `${folder}/list-stage.json`;
    await writeFile(
      stagePath + '.tmp',
      JSON.stringify({
        date: shanghaiDate(now),
        history,
        posts: target,
        readings: readings.filter((r) => r.kind === 'list'),
      }),
      { mode: 0o600 },
    );
    await rename(stagePath + '.tmp', stagePath);
    archivePaths.push(stagePath);
    writeState(database, `${config.platformId}:list-stage`, { date: shanghaiDate(now), path: stagePath });
  }
  if (restored) {
    // Load titles with normal scrolling so needed detail links are present in the page DOM.
    for (let i = 0; i < config.maxScreens; i++) {
      const present = await session.inspect(config.platformId, config.listScroll, config.titleSelector);
      const needed = target.filter((p) => ageInDays(p.publishedAt, now) <= workspace.parameters.recentWindow);
      if (needed.every((p) => present.titles.some((t) => normalizeTitle(t) === normalizeTitle(p.title)))) break;
      if (i === config.maxScreens - 1) throw new Error('恢复列表时未找到详情入口');
      await session.scroll(config.listScroll);
    }
  }
  const decisions = await prepareAssociations(database, config.platformId, target, judgment, config.matchWindowDays);
  const detailState = readState(database, `${config.platformId}:detail-stage`);
  if (
    detailState?.date === shanghaiDate(now) &&
    typeof detailState.path === 'string' &&
    detailState.path.startsWith('data/captures/') &&
    !detailState.path.includes('..')
  ) {
    const savedDetails = z
      .object({
        date: z.string(),
        completed: z.record(z.string(), z.array(z.number())),
        readings: z.array(
          z.object({
            sourcePath: z.string().startsWith('data/'),
            capturedAt: z.string(),
            reading: screenshotReading,
            kind: z.literal('detail'),
            postKey: z.string(),
          }),
        ),
      })
      .parse(JSON.parse(await readFile(detailState.path, 'utf8')));
    if (savedDetails.date === shanghaiDate(now)) {
      const eligible = new Set(target.map((p) => p.key));
      const reused = savedDetails.readings.filter((r) => eligible.has(r.postKey));
      readings.push(...reused);
      if (reused.length) reusedScreenshots();
      archivePaths.push(
        detailState.path,
        ...reused.flatMap((r) => [r.sourcePath, r.sourcePath.replace('.png', '.json')]),
      );
      sequence += reused.length;
      for (const [key, days] of Object.entries(savedDetails.completed)) if (eligible.has(key)) completed[key] = days;
      progress(`恢复已核验详情：${Object.keys(completed).length} 条近期作品`);
    }
  }
  for (const post of target) {
    const age = ageInDays(post.publishedAt, now);
    if (age > workspace.parameters.recentWindow) continue;
    const prior = readState(database, `checkpoints:${post.key}`);
    const days = Array.isArray(prior?.days) ? (prior.days as number[]) : [];
    const due = detailCheckpoints(
      age,
      config.detailCheckpoints,
      days,
      !!readState(database, `anomaly:${post.key}`)?.active,
    );
    const missingDaily = missingDailyPostMetrics(workspace, config.platformId, post, readings, config.aliases);
    if (
      !missingDaily.length &&
      (!due.needed || (completed[post.key] && due.due.every((d) => completed[post.key].includes(d))))
    )
      continue;
    if (missingDaily.length) progress(`列表缺少${missingDaily.map((m) => m.name).join('、')}，补读详情：${post.title}`);
    const detail = await session.openDetail(post.title, config.titleSelector);
    let closeDetail = true;
    try {
      await detail.settle();
      for (const tab of config.detailTabs) {
        if (tab !== config.detailTabs[0]) await detail.click(`loc=role:tab[name=${JSON.stringify(tab)}]`);
        // Each tab starts at the top; all movement is wheel input, never script scroll jumps.
        for (let rewind = 0; rewind < config.maxScreens; rewind++) {
          const state = await detail.inspect(config.platformId);
          if (state.scroll.top <= 1) break;
          await detail.scroll('html', -1);
        }
        for (let segment = 0; segment < config.maxScreens; segment++) {
          const state = await detail.inspect(config.platformId);
          await capture(
            detail,
            'detail',
            `本页属于${JSON.stringify(post)}，${tab}。即使截图滚动后标题不可见，指标仍归这条作品。`,
            post,
          );
          if (
            !due.needed &&
            !missingDailyPostMetrics(workspace, config.platformId, post, readings, config.aliases).length
          )
            break;
          if (state.text.includes('展开更多') && tab === '流量分析' && segment === 0) {
            await detail.click(config.expandSources);
            continue;
          }
          const after = await detail.inspect(config.platformId);
          if (after.scroll.top + after.scroll.height >= after.scroll.total - 3) break;
          if (segment === config.maxScreens - 1) throw new Error('详情截图未完成');
          await detail.scroll();
        }
        if (
          !due.needed &&
          !missingDailyPostMetrics(workspace, config.platformId, post, readings, config.aliases).length
        )
          break;
      }
      if (due.needed) completed[post.key] = due.due;
    } catch (error) {
      if (error instanceof Error && /控制权|ego 操作失败|浏览器操作超时/.test(error.message)) closeDetail = false;
      throw error;
    } finally {
      if (closeDetail) await detail.close();
    }
  }
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const detailPath = `${folder}/detail-stage.json`;
  await writeFile(
    detailPath + '.tmp',
    JSON.stringify({ date: shanghaiDate(now), completed, readings: readings.filter((r) => r.kind === 'detail') }),
    { mode: 0o600 },
  );
  await rename(detailPath + '.tmp', detailPath);
  archivePaths.push(detailPath);
  writeState(database, `${config.platformId}:detail-stage`, { date: shanghaiDate(now), path: detailPath });
  await session.navigate(config.accountUrl, 'loc=role:tabpanel[name="投稿"]');
  await session.click(`${config.accountYesterdaySelector} >> nth=0`);
  await session.click(`${config.accountYesterdaySelector} >> nth=1`);
  const yesterday = shanghaiDate(new Date(now.getTime() - 86400000));
  const last = database.sqlite
    .prepare('SELECT max(data_date) date FROM account_daily WHERE platform_id = ?')
    .get(config.platformId) as { date: string | null };
  const missing = missingAccountDates(last.date, yesterday);
  for (const requestedDate of [...missing, yesterday]) {
    if (requestedDate !== yesterday || missing.length) {
      await selectAccountDate(session, config, requestedDate);
    }
    for (let rewind = 0; rewind < config.maxScreens; rewind++) {
      const state = await session.inspect(config.platformId);
      if (state.scroll.top <= 1) break;
      await session.scroll('html', -1);
    }
    const accountPage = await session.inspect(config.platformId);
    const workDate = accountPage.text.match(/作品数据\s*统计周期：(\d{4}-\d{2}-\d{2})（/u)?.[1];
    const fansDate = accountPage.text.match(/粉丝数据\s*统计周期：(\d{4}-\d{2}-\d{2})（/u)?.[1];
    if (!workDate || !fansDate || workDate !== fansDate) throw new Error('账号数据未切为同一天，拒绝写入日数据');
    accountDate = workDate;
    for (let segment = 0; segment < config.maxScreens; segment++) {
      const state = await session.inspect(config.platformId);
      await capture(
        session,
        'account',
        `只读当前指定日期的作品数据和粉丝数据，日期已从页面标注核实为${accountDate}；不取顶部数据总览的7日区间。`,
      );
      if (state.scroll.top + state.scroll.height >= state.scroll.total - 3) break;
      if (segment === config.maxScreens - 1) throw new Error('账号页面截图未完成');
      await session.scroll();
    }
    if (accountDate !== requestedDate) throw new Error(`账号日期选择失败：需要${requestedDate}，实际${accountDate}`);
  }
  if (readState(database, `${config.platformId}:audience-month`)?.month !== shanghaiDate(now).slice(0, 7)) {
    monthly = true;
    await session.click(`${config.accountMonthSelector} >> nth=1`);
    for (let segment = 0; segment < config.maxScreens; segment++) {
      const state = await session.inspect(config.platformId);
      await capture(
        session,
        'account',
        '仅提取粉丝性别、年龄、地域分布原文；不提取账号数字，不提取设备、活跃度、兴趣。',
      );
      if (state.scroll.top + state.scroll.height >= state.scroll.total - 3) break;
      if (segment === config.maxScreens - 1) throw new Error('月度画像页面未读取完整');
      await session.scroll();
    }
    monthly = false;
  }
  for (const post of target) {
    const detailReadings = readings.filter((r) => r.postKey === post.key && r.kind === 'detail');
    const sourceLabels = new Set(Object.values(config.sourceGroups).flat());
    const sources = new Map(
      detailReadings.flatMap((r) =>
        r.reading.posts.flatMap((p) =>
          p.metrics.filter((m) => sourceLabels.has(m.label)).map((m) => [m.label, m.raw] as [string, string | null]),
        ),
      ),
    );
    const last = detailReadings.at(-1);
    if (sources.size && last) {
      const metrics = groupSources(sources, config.sourceGroups);
      last.reading.posts.push({ ...post, metrics });
    }
  }
  // Commit only after every required page and recognition succeeds; failures never replace a successful day.
  const selected = new Set(target.map((p) => p.key));
  for (const r of readings)
    if (r.kind === 'list')
      r.reading.posts = r.reading.posts.filter((p) => selected.has(postKey(config.platformId, p.title, p.publishedAt)));
  for (const item of target.filter((p) => ageInDays(p.publishedAt, now) <= workspace.parameters.recentWindow)) {
    const expected = workspace.metrics.filter(
      (m) =>
        m.scope === 'post' &&
        m.kind === 'number' &&
        m.bindings.some(
          (b) =>
            b.platformId === config.platformId &&
            (b.form === item.form || b.form === 'all') &&
            b.level === 'core' &&
            b.status === 'confirmed' &&
            (completed[item.key] || b.frequency === 'daily'),
        ),
    );
    const seen = new Set(
      readings.flatMap((r) =>
        r.reading.posts
          .filter((p) => postKey(config.platformId, p.title, p.publishedAt) === item.key)
          .flatMap((p) =>
            p.metrics.map(
              (m) => metricFor(workspace, config.platformId, 'post', item.form, m.label, config.aliases)?.id,
            ),
          ),
      ),
    );
    const missing = expected.filter((m) => !seen.has(m.id));
    if (missing.length)
      throw new Error(`作品核心指标未读取完整：${item.title}；${missing.map((m) => m.name).join('、')}`);
  }
  const accountSeen = new Set(
    readings.flatMap((r) =>
      r.reading.account.metrics.map(
        (m) => metricFor(workspace, config.platformId, 'account', 'all', m.label, config.accountAliases)?.id,
      ),
    ),
  );
  const accountMissing = workspace.metrics.filter(
    (m) =>
      m.scope === 'account' &&
      m.kind === 'number' &&
      m.bindings.some((b) => b.platformId === config.platformId && b.status === 'confirmed' && b.level === 'core') &&
      !accountSeen.has(m.id),
  );
  if (accountMissing.length) throw new Error(`账号核心指标缺失：${accountMissing.map((m) => m.name).join('、')}`);
  persistCollection(database, config.platformId, target, readings, decisions, workspace, {
    history,
    historyRange: config.historyRange,
    aliases: config.aliases,
    accountAliases: config.accountAliases,
    completed,
    now,
  });
  if (readings.some((r) => r.kind === 'account' && r.reading.records.some((record) => record.type === 'audience')))
    writeState(database, `${config.platformId}:audience-month`, { month: shanghaiDate(now).slice(0, 7) });
  // Only recent works are in scope; older records from future collection days remain preserved.
  for (const old of database.db.select().from(posts).where(eq(posts.platformId, config.platformId)).all()) {
    if (
      old.publishedAt &&
      sinceStartDate(old.publishedAt, workspace.parameters.startDate, now) &&
      !target.some((p) => decisions.get(p.key)?.postId === old.id)
    )
      database.db.update(posts).set({ removed: true, updatedAt: now.toISOString() }).where(eq(posts.id, old.id)).run();
  }
  writeState(database, `${config.platformId}:list-stage`, {});
  writeState(database, `${config.platformId}:detail-stage`, {});
  return { posts: target.length, screenshots: sequence, history };
}
