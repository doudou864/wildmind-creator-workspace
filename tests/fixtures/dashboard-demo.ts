// 固定、可重复的前端演示夹具。不能用于真实采集、基线或命中率计算。
export const DEMO_DATE = '2026-10-17';
export type Day = { date: string; values: Record<string, number | null> };
export type Work = {
  id: string; title: string; form: string; published: string;
  ratios: Record<string, number | null>; state: string;
  reason?: string; baseline: number | null; samples: number;
};
export type DemoPlatform = {
  status: 'success' | 'failed'; lastSuccess: string; error?: string;
  days: Day[]; works: Work[];
  baselines: Record<string, number | null>;
};
const works: Work[] = [
  { id: '01', title: 'GPT-6.1 Sol 和 Astra 实测对比', form: '视频', published: '2026-10-03', ratios: { '3': 3.4, '7': 2.2, '21': null }, state: '走势中', baseline: 46210, samples: 20 },
  { id: '02', title: 'KYC 到底是什么？3 分钟讲清', form: '视频', published: '2026-09-25', ratios: { '3': 1.1, '7': 1.6, '21': 1.8 }, state: '长尾型', baseline: 46210, samples: 20 },
  { id: '03', title: 'AI 生图提示词 10 条', form: '视频', published: '2026-09-21', ratios: { '3': 2.8, '7': 1.1, '21': 0.9 }, state: '昙花型', baseline: 46210, samples: 20 },
  { id: '04', title: '我用 AI 管 9 个平台', form: '视频', published: '2026-10-14', ratios: { '3': 1.2, '7': null, '21': null }, state: '早期平淡', baseline: 46210, samples: 20 },
  { id: '05', title: '一人公司的第一年', form: '图文', published: '2026-10-10', ratios: { '3': null, '7': null, '21': null }, state: '样本不足', reason: '同形式有效样本仅 3 条，未达到基线最低样本数。', baseline: null, samples: 3 },
  { id: '06', title: '摆烂式效率法', form: '视频', published: '2026-09-19', ratios: { '3': 0.6, '7': 0.5, '21': 0.4 }, state: '未命中', baseline: 46210, samples: 20 },
  { id: '07', title: 'ChatGPT 记忆功能怎么关', form: '视频', published: '2026-09-26', ratios: { '3': 1, '7': 0.9, '21': 0.8 }, state: '未命中', baseline: 46210, samples: 20 },
  { id: '08', title: '野生脑洞是怎么开始的', form: '图文', published: '2026-10-06', ratios: { '3': null, '7': null, '21': null }, state: '样本不足', reason: '图文单独计算基线，当前有效样本不足。', baseline: null, samples: 3 },
];

function makeDays(scale: number, finalTotal: number, negative = false): Day[] {
  let total = finalTotal;
  const days: Day[] = [];
  for (let index = 89; index >= 0; index--) {
    const date = new Date(`${DEMO_DATE}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (90 - index));
    const lost = index === 89 ? Math.round(100 * scale) : Math.round((40 + (index * 17 % 90)) * scale);
    const added = index === 89 ? Math.round(412 * scale) : Math.round((180 + (index * 47 % 300) + (index === 77 ? 1200 : 0)) * scale);
    const net = (negative && index === 89) ? -38 : ([68, 79].includes(index) ? -Math.round(60 * scale) : added - lost);
    const views = index === 89 ? Math.round(128402 * scale) : Math.round((115000 + (index * 17439 % 145000) + (index === 77 ? 250000 : 0)) * scale);
    days.unshift({ date: date.toISOString().slice(0, 10), values: { daily_views: views, followers: total, net_followers: net, new_followers: net + lost, lost_followers: lost } });
    total -= net;
  }
  return days;
}

// 所有演示平台均是独立夹具，无跨平台比较逻辑。
export const demo: Record<string, DemoPlatform> = {
  douyin: { status: 'success', lastSuccess: '2026-10-17T10:41:00+08:00', days: makeDays(1, 86214), works, baselines: { 视频: 46210, 图文: null } },
  xiaohongshu: { status: 'failed', lastSuccess: '2026-10-16T10:38:00+08:00', error: '登录失效，请重新扫码。今日采集失败，保留最近一次成功数据。', days: makeDays(0.42, 21638, true).slice(0, -1), works: [{ ...works[0], id: 'xhs-01', ratios: { '3': 1.8, '7': 1.3, '21': null }, baseline: 18340 }], baselines: { 视频: 18340 } },
  bilibili: { status: 'success', lastSuccess: '2026-10-17T10:44:00+08:00', days: makeDays(0.21, 12836), works: [{ ...works[1], id: 'blb-01', ratios: { '3': 1.2, '7': 1.6, '21': 1.7 }, baseline: 12480 }], baselines: { 视频: 12480 } },
  channels: { status: 'success', lastSuccess: '2026-10-17T10:44:00+08:00', days: makeDays(0.13, 8296), works: [{ ...works[3], id: 'sph-01', ratios: { '3': 0.8, '7': null, '21': null }, baseline: 7200 }], baselines: { 视频: 7200 } },
  youtube: { status: 'success', lastSuccess: '2026-10-17T10:45:00+08:00', days: makeDays(0.015, 1784).map(day => ({ ...day, values: { followers: day.values.followers, net_followers: day.values.net_followers } })), works: [{ ...works[1], id: 'yt-01', ratios: { '3': 0.9, '7': 1.4, '21': 1.6 }, baseline: 940 }], baselines: { 视频: 940 } },
};
