# 项目状态同步（2026-10-29）

范围：用户要求使用 neat-freak 同步当前项目并上传现有 GitHub 仓库；不改变业务逻辑，不触发真实采集、生图或发布。

| 事实面 | 状态 | 证据与处理 |
|---|---|---|
| 代码 | verified-current | 基线 fe24d9b；检查 workspace-service、任务入口、配置、现有验收；完整 check 91文件259测试通过 |
| 文档 | changed-and-verified | README 去除未接入声明；PRD 明确基础版本与修订优先级；ROADMAP 修正当前总览、发布状态、调度时段与并行规则；service-contracts 修正接口接入状态 |
| 运行态 | pending | 本机首页 HTTP 200；未重新操作真实平台，历史上传/发布/采集验收仅作为历史证据 |
| 规则 | verified-current | 项目 AGENTS.md 与上级规则已读；保留新增依赖、真实操作、格式化和采集契约约束 |
| 记忆 | out-of-scope | generated-read-only；本次未授权记忆修改，不写入 |
| 工作区 | verified-current | 1个工作区；用户原有选题渠道和进度修订纳入版本，next-env 为 Next 开发服务自动生成差异，保留现场 |

盘点已枚举项目 Markdown；旧 plans、archive、verification 保留历史证据，不删除。未发现需要本轮删除的唯一内容副本；没有清场操作。Git 忽略 data、环境配置、依赖和构建缓存，未跟踪数据库或环境密钥文件；常见 token/私钥模式扫描未命中（不是全面秘密审计）。现有远端为公开仓库，继续沿用其可见性；现有公开账号和验收图保持既有版本管理方式。

验证：npm run format、npm run check、git diff --check；本轮仅文档/用户已有渠道变更，不另做生产构建或重新采集。已知 warning：Node MODULE_TYPELESS_PACKAGE_JSON，未为消除警告修改运行方式。历史 PRD v1.9/v1.10 和计划保留当时内容，现役入口及覆盖关系见 docs/PRD.md。

待验收清单以 ROADMAP 当前总览为准；GitHub 只备份代码、配置与文档，不备份本机业务数据、素材和登录。
