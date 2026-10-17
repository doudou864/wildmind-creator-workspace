import { z } from 'zod';

export type TopicCandidate = {
  id: string; title: string; direction: string; channelId: string; signal: string;
  sourceContext: string; exploration: boolean;
  evidence: { count: number; d21: number; trend: string; reason: string } | null;
};
export const TOPIC_DEMO_DATE = '2026-10-17';
export const TOPIC_DEMO_SAMPLES = 32;
export const TOPIC_STORAGE_KEY = 'wildmind:topic-demo:v1';
export const topicDecisionSchema = z.object({
  status: z.enum(['candidate', 'selected', 'skipped']),
  frozenFire: z.boolean().nullable(), frozenReason: z.string().min(1).nullable(), selectedAt: z.iso.datetime().nullable(),
}).refine(value => (value.frozenFire === null) === (value.selectedAt === null), '定格标记与时间必须一起存在')
  .refine(value => (value.frozenReason === null) === (value.selectedAt === null), '定格依据与时间必须一起存在')
  .refine(value => value.status !== 'selected' || value.selectedAt !== null, '选中状态必须有定格记录');
export const topicDecisionsSchema = z.record(z.string(), topicDecisionSchema);
export type TopicDecision = z.infer<typeof topicDecisionSchema>;
export type TopicDecisions = z.infer<typeof topicDecisionsSchema>;

// 人工编写的界面演示资料。线索、历史表现、推荐依据都不是实际抓取或 AI 推断结果。
export const topicDemo: TopicCandidate[] = [
  { id: 't01', title: 'AI 工具那么多，新手先留下哪三个？', direction: '从写作、查资料、整理文件三个实际任务入手，做一份能直接照着选的入门清单。', channelId: 'search_keywords', signal: '新手 AI 工具怎么选', sourceContext: '演示搜索词 · 工具选择相关作品', exploration: false, evidence: { count: 3, d21: 2.3, trend: '2 条长尾型', reason: '同类工具选择题材做过 3 条，其中 2 条为长尾型，D21 平均为基线的 2.3×。' } },
  { id: 't02', title: '模型实测之后，普通人怎么做选择？', direction: '把同一个日常任务交给不同模型，展示成品差异和需要人工修改的地方，让观众按用途判断。', channelId: 'followup_search', signal: '模型对比看完了，日常到底用哪个', sourceContext: '演示后续搜索 · 模型实测相关作品', exploration: false, evidence: { count: 4, d21: 1.9, trend: '2 条爆发型', reason: '同类实际任务对比做过 4 条，其中 2 条为爆发型，D21 平均为基线的 1.9×。' } },
  { id: 't03', title: 'KYC 是什么？先把这几个词弄明白', direction: '用一个虚构的注册流程解释 KYC、身份验证与地址证明的区别，通过不同的使用场景，把这些概念讲清楚。', channelId: 'followup_search', signal: 'KYC 和实名认证有什么区别', sourceContext: '演示后续搜索 · 名词解释相关作品', exploration: false, evidence: { count: 3, d21: 2.1, trend: '2 条长尾型', reason: '同类名词解释做过 3 条，其中 2 条为长尾型，D21 平均为基线的 2.1×。' } },
  { id: 't04', title: '提示词写得很长，为什么结果还是不对？', direction: '拿同一个任务对比模糊要求与具体要求，把目标、材料和验收条件逐项补齐。', channelId: 'valuable_messages', signal: '照着模板写了一大段，还是得自己重做', sourceContext: '演示评论 · 提示词相关作品', exploration: false, evidence: null },
  { id: 't05', title: '一个人做内容，哪些步骤值得交给 AI？', direction: '拆开一次内容制作流程，逐项记录耗时、返工和判断成本，让观众找到自己的自动化起点。', channelId: 'search_keywords', signal: '自媒体 AI 工作流', sourceContext: '演示搜索词 · 一人公司相关作品', exploration: false, evidence: null },
  { id: 't06', title: '不用再做新工具，先整理你已经收藏的工具', direction: '从一份杂乱收藏夹开始，按真实使用任务清理重复工具，留下可复用的选择清单。', channelId: 'valuable_messages', signal: '收藏了很多工具，真正用的还是那几个', sourceContext: '演示评论 · 效率工具相关作品', exploration: false, evidence: null },
  { id: 't07', title: '让 AI 帮你整理家庭维修记录，会发生什么？', direction: '探索内容创作以外的日常任务：把零散维修记录整理成可查的时间线，检验遗漏与错误。', channelId: 'valuable_messages', signal: '这些方法能不能用到家里的杂事上', sourceContext: '演示评论 · 外延问题；近期热度待验证', exploration: true, evidence: null },
  { id: 't08', title: 'AI 为什么总记错我的要求？', direction: '把当前对话、长期记忆和项目说明分开演示，观察哪种信息需要明确重复给出。', channelId: 'followup_search', signal: 'AI 记忆和上下文的区别', sourceContext: '演示后续搜索 · 记忆功能相关作品', exploration: false, evidence: null },
  { id: 't09', title: '同一篇文章，怎么改成适合三个平台的版本？', direction: '只改标题、篇幅与结构，保留同一个核心观点，对照三份成稿解释每一步取舍。', channelId: 'search_keywords', signal: '一篇文章多平台分发', sourceContext: '演示搜索词 · 内容分发相关作品', exploration: false, evidence: null },
  { id: 't10', title: '自动化做完了，为什么还是每天在救火？', direction: '挑一个容易失败的自动化任务，补上状态记录、失败提示和人工接手入口，看返工是否减少。', channelId: 'valuable_messages', signal: '流程跑得起来，但出错了根本不知道是哪一步', sourceContext: '演示评论 · 自动化相关作品', exploration: false, evidence: { count: 3, d21: 1.8, trend: '1 条长尾型', reason: '同类自动化排错做过 3 条，其中 1 条为长尾型，D21 平均为基线的 1.8×。' } },
  { id: 't11', title: '什么样的 AI 回答，值得再查一次来源？', direction: '用日期、价格和产品功能三个容易变化的例子，示范如何逐条核对回答里的关键事实。', channelId: 'valuable_messages', signal: '回答很像真的，我怎么知道哪里需要核实', sourceContext: '演示私信 · 使用疑问', exploration: false, evidence: null },
  { id: 't12', title: '封面看起来很高级，为什么没人点？', direction: '用同一个主题做两版封面，把视觉装饰和信息承诺分开，设计一次可核对的对照测试。', channelId: 'search_keywords', signal: '视频封面点击率怎么提高', sourceContext: '演示搜索词 · 内容制作相关作品', exploration: false, evidence: null },
  { id: 't13', title: '用 AI 记录一次城市散步，能留下什么？', direction: '探索把路线、随手拍和当时的想法整理成个人观察笔记，检查整理过程是否改变原意。', channelId: 'valuable_messages', signal: '除了办公，能不能试试生活记录', sourceContext: '演示评论 · 新方向；近期热度待验证', exploration: true, evidence: null },
  { id: 't14', title: '知识库越存越多，为什么反而找不到？', direction: '从一个真实问题反推需要的资料，比较按文件夹保存与按问题建立索引的查找过程。', channelId: 'search_keywords', signal: '知识库资料太多怎么整理', sourceContext: '演示搜索词 · 知识管理相关作品', exploration: false, evidence: null },
  { id: 't15', title: '把常用提示词变成模板，先固定哪几项？', direction: '挑一个每周重复的任务，把输入材料、输出格式和检查标准固定，留下需要临时判断的部分。', channelId: 'followup_search', signal: '提示词模板怎么重复使用', sourceContext: '演示后续搜索 · 提示词相关作品', exploration: false, evidence: null },
  { id: 't16', title: 'AI 做的表格，你真的检查过吗？', direction: '准备含空值、重复行和异常值的小表格，展示只看排版与逐项核对结果的差别。', channelId: 'valuable_messages', signal: '表格做得很快，但数字对不对心里没底', sourceContext: '演示评论 · 办公任务相关作品', exploration: false, evidence: null },
  { id: 't17', title: '一个人做项目，需求为什么越改越大？', direction: '从一个最小任务出发，记录每次加功能的理由和代价，演示如何把本轮要做的事写清楚。', channelId: 'search_keywords', signal: '一人公司项目管理', sourceContext: '演示搜索词 · 一人项目相关作品', exploration: false, evidence: null },
  { id: 't18', title: 'AI 能把旧物说明书变成可搜索的家庭档案吗？', direction: '探索整理家电说明书、购买记录和配件信息，重点检验找答案是否更快、信息是否准确。', channelId: 'followup_search', signal: '文档整理的方法能不能用来管说明书', sourceContext: '演示后续搜索 · 新用途；近期热度待验证', exploration: true, evidence: null },
  { id: 't19', title: '为什么我不再让 AI 一次完成整个任务？', direction: '把同一个任务分别一次完成和分阶段检查，比较最终结果、耗时与返工次数。', channelId: 'followup_search', signal: 'AI 任务拆解怎么做', sourceContext: '演示后续搜索 · AI 协作相关作品', exploration: false, evidence: null },
  { id: 't20', title: '做了一个月内容，先看哪几个数据？', direction: '从播放、留存和后续增长中各选一个问题，演示如何用自己的历史作品建立比较标准。', channelId: 'search_keywords', signal: '自媒体数据复盘看什么', sourceContext: '演示搜索词 · 内容运营相关作品', exploration: false, evidence: null },
];
