# 数据模型（基础骨架）

数据库：`data/workspace.db`，SQLite WAL，schema：`src/db/schema.ts`，迁移：`src/db/migrations/`。执行 `npm run db:migrate` 会先在线备份再迁移；重复执行不重建表、不清空数据。

业务依据：PRD v1.9 第 10 章是建议实体；字段细节按当前 `docs/service-contracts.md` 与 `src/lib/*-model.ts`。持久化底座已接入第 2 步抖音采集；业务页面 CRUD、复盘和发布服务按 ROADMAP 后续步骤接入。

所有普通记录保留 updatedAt，无乐观版本。revision 只在发布记录/回执、消息、商单、后台主题和选题生成任务/结果。表里的 snake_case 与模型 camelCase 对应。JSON 是结构化正文/证据，不存二进制。

MetricDefinition 只存在 YAML，不复制到数据库；历史行保留原 metric_id。删除指标应标 dropped，测试指标验收后删除。数值字段不得用 0 补空。采集只保存真实读到的数值；复盘算法在第 4 步实现。

## accounts

每个平台一个本机账号；登录资料存文件，表里只有路径和检查结果。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| platform_id | TEXT 主键 / 必填 | config/platforms.yaml 的平台 ID | §10、11.1；契约 | 登录命令 / 发布中心 accounts |
| platform_account_id | TEXT / 可空 | platform_account_id，对应同名契约字段/实体关联 | §10、11.1；契约 | 登录命令 / 发布中心 accounts |
| display_name | TEXT / 可空 | display_name，对应同名契约字段/实体关联 | §10、11.1；契约 | 登录命令 / 发布中心 accounts |
| login_state | TEXT / 必填 | logged_in / logged_out / unknown / awaiting_confirmation | §10、11.1；契约 | 登录命令 / 发布中心 accounts |
| checked_at | TEXT / 可空 | 最近登录检查时间 | §10、11.1；契约 | 登录命令 / 发布中心 accounts |
| reason | TEXT / 可空 | 真实失败/未知原因，不填估计结果 | §10、11.1；契约 | 登录命令 / 发布中心 accounts |
| state_path | TEXT / 可空 | data/browser/ 登录资料文件路径 | §10、11.1；契约 | 登录命令 / 发布中心 accounts |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §10、11.1；契约 | 登录命令 / 发布中心 accounts |

## account_daily

每个平台、数据日期、指标 ID 唯一；value 可空。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §8、10；契约 | 总控台 / GET /api/dashboard |
| platform_id | TEXT / 必填 | config/platforms.yaml 的平台 ID | §8、10；契约 | 总控台 / GET /api/dashboard |
| data_date | TEXT / 必填 | 平台标注的数据日期，不用抓取日替代 | §8、10；契约 | 总控台 / GET /api/dashboard |
| metric_id | TEXT / 必填 | config/metrics.yaml 指标 ID，不复制名称/规则 | §8、10；契约 | 总控台 / GET /api/dashboard |
| value | REAL / 可空 | 数值；NULL=未知，0=真实零 | §8、10；契约 | 总控台 / GET /api/dashboard |
| captured_at | TEXT / 必填 | 真实读取/抓取时间 | §8、10；契约 | 总控台 / GET /api/dashboard |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §8、10；契约 | 总控台 / GET /api/dashboard |

## post_snapshots

每行一个指标；同一作品同一抓取时刻同一指标唯一。不同抓取时刻保留历史。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| post_id | TEXT / 必填 | 关联 Post | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| captured_at | TEXT / 必填 | 真实读取/抓取时间 | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| capture_date | TEXT / 必填 | 抓取日期 | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| day_after_publish | INTEGER / 可空 | 发布后第 N 天，未知可空 | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| metric_id | TEXT / 必填 | config/metrics.yaml 指标 ID，不复制名称/规则 | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| value | REAL / 可空 | 数值；NULL=未知，0=真实零 | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| backfill_kind | TEXT / 必填 | none 正常 / checkpoint 检查点补抓 / historical 首次历史补录 | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.8、7、10；契约 | 总控台 / 复盘（第2、4步） |

## posts

平台真实作品与工作台作品的对应关系，不是上传准备。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| content_id | TEXT / 必填 | 关联 Content | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| platform_id | TEXT / 必填 | config/platforms.yaml 的平台 ID | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| platform_post_id | TEXT / 可空 | 平台真实作品 ID，未识别可空 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| published_at | TEXT / 可空 | 真实发布时间，未发布/未知可空 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| title | TEXT / 必填 | 标题/名称 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| url | TEXT / 可空 | 真实平台作品链接 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| checkpoint_ratios | TEXT / 可空 | 检查点到定格倍数的映射，未计算可空 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| trend | TEXT / 可空 | 走势类型，未计算可空 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| hit | INTEGER / 可空 | 定格命中结果，未计算可空 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| first_publication | INTEGER / 可空 | 是否首发，未知可空 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| removed | INTEGER / 可空 | 是否下架，未知可空 | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.8、7、10；契约 | 总控台 / 平台发布结果关联（后续） |

## contents

video_covers 是比例到素材 ID 的采用映射。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.2–6.5、10；契约 | Content / /api/contents |
| topic_id | TEXT / 可空 | 关联 Topic | §6.2–6.5、10；契约 | Content / /api/contents |
| form | TEXT / 必填 | 视频 / 图文 | §6.2–6.5、10；契约 | Content / /api/contents |
| title | TEXT / 必填 | 标题/名称 | §6.2–6.5、10；契约 | Content / /api/contents |
| planned_date | TEXT / 可空 | 计划发布日期 | §6.2–6.5、10；契约 | Content / /api/contents |
| video_covers | TEXT / 必填 | 比例 → assetId | §6.2–6.5、10；契约 | Content / /api/contents |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.2–6.5、10；契约 | Content / /api/contents |

## assets

version 是文件版本，不是并发修订。文件不可变，只存 data/ 下路径。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.3、10；契约 | Asset / /api/images/assets |
| family_id | TEXT / 必填 | 素材家族 ID | §6.3、10；契约 | Asset / /api/images/assets |
| content_id | TEXT / 可空 | 关联 Content | §6.3、10；契约 | Asset / /api/images/assets |
| topic_id | TEXT / 可空 | 关联 Topic | §6.3、10；契约 | Asset / /api/images/assets |
| title | TEXT / 必填 | 标题/名称 | §6.3、10；契约 | Asset / /api/images/assets |
| purpose_id | TEXT / 必填 | 配置用途 ID | §6.3、10；契约 | Asset / /api/images/assets |
| ratio | TEXT / 必填 | 比例字符串 | §6.3、10；契约 | Asset / /api/images/assets |
| path | TEXT / 必填 | 受控 data/ 文件路径 | §6.3、10；契约 | Asset / /api/images/assets |
| width | INTEGER / 必填 | 宽度（像素） | §6.3、10；契约 | Asset / /api/images/assets |
| height | INTEGER / 必填 | 高度（像素） | §6.3、10；契约 | Asset / /api/images/assets |
| mime | TEXT / 必填 | 实际核验的 MIME | §6.3、10；契约 | Asset / /api/images/assets |
| source | TEXT / 必填 | ai / upload | §6.3、10；契约 | Asset / /api/images/assets |
| prompt | TEXT / 必填 | 生成/修改提示词 | §6.3、10；契约 | Asset / /api/images/assets |
| version | INTEGER / 必填 | 素材文件版本 | §6.3、10；契约 | Asset / /api/images/assets |
| selected | INTEGER / 必填 | 家族默认选中 | §6.3、10；契约 | Asset / /api/images/assets |
| created_at | TEXT / 必填 | 创建时间（ISO 字符串） | §6.3、10；契约 | Asset / /api/images/assets |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.3、10；契约 | Asset / /api/images/assets |

## image_drafts

input JSON 保留当前 ImageDraftInput 全部字段。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.3；契约 | ImageDraft / /api/images/drafts |
| input | TEXT / 必填 | 接口输入快照 JSON | §6.3；契约 | ImageDraft / /api/images/drafts |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.3；契约 | ImageDraft / /api/images/drafts |

## layouts

按现有契约一条文档保存三版 variants。各版仍独立，确认时生成快照。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.4、10；契约 | LayoutDocument / /api/layouts |
| content_id | TEXT / 可空 | 关联 Content | §6.4、10；契约 | LayoutDocument / /api/layouts |
| source | TEXT / 必填 | ai / upload | §6.4、10；契约 | LayoutDocument / /api/layouts |
| variants | TEXT / 必填 | 三版正文、封面、状态、各版 updatedAt | §6.4、10；契约 | LayoutDocument / /api/layouts |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.4、10；契约 | LayoutDocument / /api/layouts |

## crawl_logs

running 是开始未结束的状态；结束必须记录时间，失败必须有原因。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |
| platform_id | TEXT / 必填 | config/platforms.yaml 的平台 ID | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |
| started_at | TEXT / 必填 | 抓取开始时间 | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |
| finished_at | TEXT / 可空 | 抓取结束时间 | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |
| status | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |
| reason | TEXT / 可空 | 真实失败/未知原因，不填估计结果 | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |
| archive_paths | TEXT / 必填 | 截图/导出文件的 data/ 相对路径数组 | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.8、10、11.1；契约 | startCrawl / finishCrawl；总控台健康条后续接入 |

## messages

消息、分类和回复证据分开；不把未知视为已回复。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.6、10；契约 | InboxMessage / /api/inbox |
| revision | INTEGER / 必填 | 并发核对版本，初始 0 | §6.6、10；契约 | InboxMessage / /api/inbox |
| platform_id | TEXT / 必填 | config/platforms.yaml 的平台 ID | §6.6、10；契约 | InboxMessage / /api/inbox |
| channel | TEXT / 必填 | comment / dm | §6.6、10；契约 | InboxMessage / /api/inbox |
| post_id | TEXT / 可空 | 关联 Post | §6.6、10；契约 | InboxMessage / /api/inbox |
| content_id | TEXT / 可空 | 关联 Content | §6.6、10；契约 | InboxMessage / /api/inbox |
| content_title | TEXT / 可空 | content_title，对应同名契约字段/实体关联 | §6.6、10；契约 | InboxMessage / /api/inbox |
| author | TEXT / 必填 | 发送者名称 | §6.6、10；契约 | InboxMessage / /api/inbox |
| body | TEXT / 必填 | 原文 | §6.6、10；契约 | InboxMessage / /api/inbox |
| sent_at | TEXT / 可空 | 真实发送时间，未知空 | §6.6、10；契约 | InboxMessage / /api/inbox |
| captured_at | TEXT / 可空 | 真实读取/抓取时间 | §6.6、10；契约 | InboxMessage / /api/inbox |
| source_url | TEXT / 可空 | 可追溯原页链接 | §6.6、10；契约 | InboxMessage / /api/inbox |
| classification | TEXT / 必填 | AI 分类状态及已校验结果 JSON | §6.6、10；契约 | InboxMessage / /api/inbox |
| reply | TEXT / 必填 | 评论/会话回复证据 JSON | §6.6、10；契约 | InboxMessage / /api/inbox |
| context | TEXT / 必填 | 会话上下文数组 JSON | §6.6、10；契约 | InboxMessage / /api/inbox |
| context_complete | INTEGER / 必填 | 上下文是否完整 | §6.6、10；契约 | InboxMessage / /api/inbox |
| deal_id | TEXT / 可空 | deal_id，对应同名契约字段/实体关联 | §6.6、10；契约 | InboxMessage / /api/inbox |
| deal_sync | TEXT / 必填 | 商单同步状态 | §6.6、10；契约 | InboxMessage / /api/inbox |
| deal_sync_reason | TEXT / 可空 | 商单同步失败原因 | §6.6、10；契约 | InboxMessage / /api/inbox |
| topic_signal_id | TEXT / 可空 | topic_signal_id，对应同名契约字段/实体关联 | §6.6、10；契约 | InboxMessage / /api/inbox |
| topic_synced_at | TEXT / 可空 | topic_synced_at，对应同名契约字段/实体关联 | §6.6、10；契约 | InboxMessage / /api/inbox |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.6、10；契约 | InboxMessage / /api/inbox |

## deals

来源消息唯一；suggestion 为后台建议，不自动改商单状态。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.7、10；契约 | Deal / /api/deals |
| revision | INTEGER / 必填 | 并发核对版本，初始 0 | §6.7、10；契约 | Deal / /api/deals |
| brand | TEXT / 可空 | 品牌，未知空 | §6.7、10；契约 | Deal / /api/deals |
| requirement | TEXT / 可空 | 需求，未知空 | §6.7、10；契约 | Deal / /api/deals |
| status | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.7、10；契约 | Deal / /api/deals |
| platform_id | TEXT / 必填 | config/platforms.yaml 的平台 ID | §6.7、10；契约 | Deal / /api/deals |
| channel | TEXT / 必填 | comment / dm | §6.7、10；契约 | Deal / /api/deals |
| message_id | TEXT / 必填 | 来源 Message | §6.7、10；契约 | Deal / /api/deals |
| suggestion | TEXT / 可空 | 商单建议与消息证据版本 JSON | §6.7、10；契约 | Deal / /api/deals |
| created_at | TEXT / 必填 | 创建时间（ISO 字符串） | §6.7、10；契约 | Deal / /api/deals |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.7、10；契约 | Deal / /api/deals |

## demand_themes

revision 保护后台聚合与用户送选题的并发。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.1、6.6；契约 | DemandTheme / /api/dashboard/themes/:id/topic |
| revision | INTEGER / 必填 | 并发核对版本，初始 0 | §6.1、6.6；契约 | DemandTheme / /api/dashboard/themes/:id/topic |
| title | TEXT / 必填 | 标题/名称 | §6.1、6.6；契约 | DemandTheme / /api/dashboard/themes/:id/topic |
| summary | TEXT / 必填 | 主题摘要 | §6.1、6.6；契约 | DemandTheme / /api/dashboard/themes/:id/topic |
| message_ids | TEXT / 必填 | 关联消息 ID 数组 | §6.1、6.6；契约 | DemandTheme / /api/dashboard/themes/:id/topic |
| signal_id | TEXT / 可空 | signal_id，对应同名契约字段/实体关联 | §6.1、6.6；契约 | DemandTheme / /api/dashboard/themes/:id/topic |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.1、6.6；契约 | DemandTheme / /api/dashboard/themes/:id/topic |

## topics

普通状态以最后保存为准；首次定格独立保存，不跟随后台生成覆盖。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.2、7、10；契约 | Topic / /api/topics |
| title | TEXT / 必填 | 标题/名称 | §6.2、7、10；契约 | Topic / /api/topics |
| direction | TEXT / 必填 | 选题方向 | §6.2、7、10；契约 | Topic / /api/topics |
| channel_id | TEXT / 必填 | 配置的选题渠道 ID | §6.2、7、10；契约 | Topic / /api/topics |
| signal | TEXT / 必填 | 输入信号文本 | §6.2、7、10；契约 | Topic / /api/topics |
| source_context | TEXT / 必填 | 来源说明原文 | §6.2、7、10；契约 | Topic / /api/topics |
| source_url | TEXT / 可空 | 可追溯原页链接 | §6.2、7、10；契约 | Topic / /api/topics |
| exploration | INTEGER / 必填 | 是否探索位 | §6.2、7、10；契约 | Topic / /api/topics |
| evidence | TEXT / 可空 | 当前 FIRE 证据 | §6.2、7、10；契约 | Topic / /api/topics |
| status | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.2、7、10；契约 | Topic / /api/topics |
| frozen_fire | INTEGER / 可空 | 首次选中时的 FIRE 定格，未选中可空 | §6.2、7、10；契约 | Topic / /api/topics |
| frozen_evidence | TEXT / 可空 | 首次选中时完整证据 | §6.2、7、10；契约 | Topic / /api/topics |
| selected_at | TEXT / 可空 | 首次选中时间 | §6.2、7、10；契约 | Topic / /api/topics |
| automatic | INTEGER / 必填 | 是否由系统自动建立 | §6.2、7、10；契约 | Topic / /api/topics |
| created_at | TEXT / 必填 | 创建时间（ISO 字符串） | §6.2、7、10；契约 | Topic / /api/topics |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.2、7、10；契约 | Topic / /api/topics |

## topic_signals

source_message_id/source_theme_id 各自唯一，支撑幂等；其他渠道不臆造去重口径。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| source_type | TEXT / 必填 | 信号来源类型 | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| text | TEXT / 必填 | 信号原文 | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| share | REAL / 可空 | 来源占比，未知可空 | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| post_id | TEXT / 可空 | 关联 Post | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| source_url | TEXT / 可空 | 可追溯原页链接 | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| source_message_id | TEXT / 可空 | source_message_id，对应同名契约字段/实体关联 | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| source_theme_id | TEXT / 可空 | source_theme_id，对应同名契约字段/实体关联 | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| captured_at | TEXT / 必填 | 真实读取/抓取时间 | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.2、6.6、10；契约 | TopicSignal / 收件箱与主题送选题接口 |

## topic_generation_tasks

保留后台任务的状态与修订，不实现生成。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.2；契约 | POST /api/topics/generate（任务接口后续实现） |
| revision | INTEGER / 必填 | 并发核对版本，初始 0 | §6.2；契约 | POST /api/topics/generate（任务接口后续实现） |
| status | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.2；契约 | POST /api/topics/generate（任务接口后续实现） |
| reason | TEXT / 可空 | 真实失败/未知原因，不填估计结果 | §6.2；契约 | POST /api/topics/generate（任务接口后续实现） |
| created_at | TEXT / 必填 | 创建时间（ISO 字符串） | §6.2；契约 | POST /api/topics/generate（任务接口后续实现） |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.2；契约 | POST /api/topics/generate（任务接口后续实现） |

## topic_generation_results

生成字段与用户 Topic 状态分离；不能将结果 JSON 直接覆盖整条 Topic。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.2；契约 | 选题后台生成结果写入（后续） |
| task_id | TEXT / 必填 | 关联生成任务 | §6.2；契约 | 选题后台生成结果写入（后续） |
| topic_id | TEXT / 可空 | 关联 Topic | §6.2；契约 | 选题后台生成结果写入（后续） |
| revision | INTEGER / 必填 | 并发核对版本，初始 0 | §6.2；契约 | 选题后台生成结果写入（后续） |
| generated_fields | TEXT / 必填 | 后台生成字段 JSON（不含用户状态和定格字段） | §6.2；契约 | 选题后台生成结果写入（后续） |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.2；契约 | 选题后台生成结果写入（后续） |

## publish_records

内部 API 名保留 Batch，界面称发布记录；draft 自动保存，执行动作检查 revision。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.5；契约 | PublishBatch / /api/publishing/drafts |
| revision | INTEGER / 必填 | 并发核对版本，初始 0 | §6.5；契约 | PublishBatch / /api/publishing/drafts |
| content_id | TEXT / 必填 | 关联 Content | §6.5；契约 | PublishBatch / /api/publishing/drafts |
| state | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.5；契约 | PublishBatch / /api/publishing/drafts |
| draft | TEXT / 必填 | PublishDraft JSON | §6.5；契约 | PublishBatch / /api/publishing/drafts |
| created_at | TEXT / 必填 | 创建时间（ISO 字符串） | §6.5；契约 | PublishBatch / /api/publishing/drafts |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.5；契约 | PublishBatch / /api/publishing/drafts |

## publish_receipts

每发布记录每平台一个当前回执；失败不等于可安全重试。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| revision | INTEGER / 必填 | 并发核对版本，初始 0 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| batch_id | TEXT / 必填 | 关联发布记录 ID | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| platform_id | TEXT / 必填 | config/platforms.yaml 的平台 ID | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| status | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| screenshot_asset_id | TEXT / 可空 | screenshot_asset_id，对应同名契约字段/实体关联 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| uploaded_at | TEXT / 可空 | 平台上传完成时间 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| materials | TEXT / 可空 | 当前平台使用材料的指纹 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| failure_stage | TEXT / 可空 | upload / publish，可空 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| title | TEXT / 必填 | 标题/名称 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| platform_post_id | TEXT / 可空 | 平台真实作品 ID，未识别可空 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| url | TEXT / 可空 | 真实平台作品链接 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| published_at | TEXT / 可空 | 真实发布时间，未发布/未知可空 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| reason | TEXT / 可空 | 真实失败/未知原因，不填估计结果 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| safe_to_retry | INTEGER / 必填 | 已核实未发布且可重试标记 | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.5；契约 | PublishReceipt / 上传、全部发布、retry |

## publish_snapshots

content 为不可变确认内容；退回只更新状态。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| layout_id | TEXT / 必填 | layout_id，对应同名契约字段/实体关联 | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| layout_updated_at | TEXT / 必填 | 确认时排版文档的 updatedAt | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| content_id | TEXT / 必填 | 关联 Content | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| platform | TEXT / 必填 | platform，对应同名契约字段/实体关联 | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| content | TEXT / 必填 | LayoutContent 不可变 JSON | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| confirmed_at | TEXT / 必填 | 人工确认并送出时间 | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| state | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.4、6.5；契约 | PublishSnapshot / confirm-send |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.4、6.5；契约 | PublishSnapshot / confirm-send |

## publish_videos

本机成片元数据；文件只存路径。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.5；契约 | PublishVideo / /api/publishing/media |
| content_id | TEXT / 必填 | 关联 Content | §6.5；契约 | PublishVideo / /api/publishing/media |
| name | TEXT / 必填 | 原始文件名 | §6.5；契约 | PublishVideo / /api/publishing/media |
| path | TEXT / 必填 | 受控 data/ 文件路径 | §6.5；契约 | PublishVideo / /api/publishing/media |
| bytes | INTEGER / 必填 | 文件字节数 | §6.5；契约 | PublishVideo / /api/publishing/media |
| duration | REAL / 必填 | 时长（秒） | §6.5；契约 | PublishVideo / /api/publishing/media |
| width | INTEGER / 必填 | 宽度（像素） | §6.5；契约 | PublishVideo / /api/publishing/media |
| height | INTEGER / 必填 | 高度（像素） | §6.5；契约 | PublishVideo / /api/publishing/media |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.5；契约 | PublishVideo / /api/publishing/media |

## publish_attempts

receipt 是某次尝试的完整回执副本，保留旧截图和真实结果。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 记录 ID | §6.5；契约 | 上传 / 发布尝试历史（后续） |
| receipt_id | TEXT / 必填 | receipt_id，对应同名契约字段/实体关联 | §6.5；契约 | 上传 / 发布尝试历史（后续） |
| request_id | TEXT / 必填 | 本次执行请求 UUID | §6.5；契约 | 上传 / 发布尝试历史（后续） |
| receipt | TEXT / 必填 | 某次尝试的完整 PublishReceipt JSON | §6.5；契约 | 上传 / 发布尝试历史（后续） |
| created_at | TEXT / 必填 | 创建时间（ISO 字符串） | §6.5；契约 | 上传 / 发布尝试历史（后续） |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.5；契约 | 上传 / 发布尝试历史（后续） |

## publish_requests

id 就是客户端 UUID requestId；本步只建表，不打开真实发布能力。

| 字段 | 存储类型 / 空值 | 含义 | PRD 依据 | 页面 / 接口 |
|---|---|---|---|---|
| id | TEXT 主键 / 必填 | 客户端 UUID requestId，主键防重复受理 | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |
| batch_id | TEXT / 必填 | 关联发布记录 ID | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |
| action | TEXT / 必填 | 执行动作 | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |
| input | TEXT / 必填 | 接口输入快照 JSON | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |
| result | TEXT / 可空 | 任务结果 JSON，可空 | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |
| status | TEXT / 必填 | 本实体状态，枚举见 schema.ts | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |
| created_at | TEXT / 必填 | 创建时间（ISO 字符串） | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |
| updated_at | TEXT / 必填 | 最后写入时间（ISO 字符串） | §6.5；契约 | upload / publish-all / retry 的 requestId 幂等记录 |

## JSON 子字段对照

- image_drafts.input：uploadPurposeId、title、purposeId、styleId、prompt、content、ratio、topicId、contentId、existingAssets、parentAssetId、editInstruction（§6.3，ImageDraftInput）。
- layouts.variants：wechat/douyin/x；每版 title、blocks（id/type/text/assetId）、covers、status、updatedAt（§6.4，LayoutDocument）。
- publish_records.draft：kind、contentId、videoId、imageIds、snapshotIds、commonCopy（title/description/tags）、settings（platformId/title/description/tags/scheduleAt/individuallyEdited）（§6.5，PublishDraft）。
- publish_snapshots.content：title、blocks、covers（§6.4–6.5，LayoutContent）。
- Topic evidence/frozenEvidence：count、d21、trend、reason（§6.2、7，TopicEvidence）。
- messages.classification：status 与 result(category/reason)，或失败 reason；reply：kind、conversationId、latestConfirmed、lastSender、lastMessageAt，或 ownReplyFound/repliesComplete；context 项：id、sender、author、body、sentAt（§6.6，InboxMessage）。
- deals.suggestion：id、status、reason、expectedRevision、evidenceMessageId、evidenceRevision（§6.7，Deal）。
- publish_attempts.receipt：与 publish_receipts 完整对应，含当时 revision；发布请求 input/result 保存对应接口快照（§6.5）。

## raw_records（原文记录）

| 字段 | 类型 / 空值 | 含义 |
|---|---|---|
| id | TEXT 主键 | 记录 ID |
| platform_id | TEXT 必填 | 平台 ID |
| post_id | TEXT 可空 | 关联 posts；账号级原文为空 |
| data_date | TEXT 必填 | 平台标注的数据日期 |
| type | TEXT 必填 | 原文类型，如 diagnosis / audience / viewing_times / traffic_sources |
| content | TEXT 必填 | 有效 JSON，保留原文及分布，不塞进数值列 |
| source_path | TEXT 必填 | data/ 下来源截图或导出文件路径 |
| captured_at | TEXT 必填 | 读取时间 |
| updated_at | TEXT 必填 | 更新时间 |

搜索词仍进 TopicSignal。B站星级和百分位使用不同指标 id，基线和异常仅在同一指标内比较。未发布的平台/形式保留 pending，第 12 步首发后核对。排版保持一个 LayoutDocument 含三个版本，每次确认存快照。以上四项已于 PRD v1.9 确认。

## attention_items（需要你处理）

id、platform_id、kind（login / confirmation / risk）、reason、status（pending / resolved / failed）、deadline（可空）、space_id / page（可空）、created_at、updated_at。同平台待处理项更新为最新原因；微信确认保留浏览器位置，超过当天 23:00 标为 failed，原因“未确认登录”。账号 login_state 新增 awaiting_confirmation，不当作程序错误。

## collection_state（采集恢复状态）

key（主键）、value（JSON）、updated_at。保存每天随机启动分钟和已执行时段、成功平台、一次性历史导入状态、检查点完成日期、月度画像状态。实际数字仍在长表，原文仍在 raw_records；该表不用于承载作品指标。迁移 0003 只新增该表，执行前在线备份。

数值来自平台显示文本，单位（如“万”）由确定性代码换算，显示精度保留在同名截图识别 JSON。它不代表平台未展示的更精细计数。每个 PostSnapshot 的 captured_at 对应识别文件时间，来源文件路径由本轮 CrawlLog.archive_paths 保存。首次仅接纳近 30 天视频和图文；范围外作品不建档、不建选题、不写快照。已在上线后积累的历史记录保留。

## 2026-10-17 精度和运行可观测性

PostSnapshot / AccountDaily 增加 precision（exact/display/unknown）和 rawValue；旧记录无法核对时为 unknown，不默认精确。AccountDaily 增加 backfilled。增长只汇总精确净增，禁止约数总量相减。CrawlLog 增加可空 telemetry：延迟、同日截图复用、页面操作数、AI 调用次数、需要处理项；旧日志显示未记录，耗时从开始/完成时间计算。
