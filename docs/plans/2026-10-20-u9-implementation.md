# U9 Implementation Plan

**Goal:** 按已批准的 U9 A→E 完成回复归档、本机成片、自由文档、生图对话和后台采集。

**Architecture:** 沿用现有 Next/SQLite/Drizzle/Codex SDK。手动消息处理作为平台证据外的独立可撤销层，平台新消息使覆盖失效；统计读取共用同一判断。文件只引用白名单目录且上传前验证指纹；确认稿快照仍独立冻结。富文本用 TipTap，旧段落无损转换；生图参考与对话使用已有配额/任务记录。普通归档不进入统计排除逻辑。

**Tech Stack:** 现有技术栈 + 用户已批准的 TipTap 编辑器依赖；不新增其他工具链。

## A
- src/lib/inbox-model.ts、inbox-store.ts、src/ui/inbox-summary.ts：手动优先、可撤销、会话新消息重开；独立事件记录保留审计。
- src/db/schema.ts / migrations：先在线备份，再新增消息处理元数据；不修改真实消息作验收。
- src/ui/reply-actions.tsx、src/app/inbox/inbox-page.tsx：三个操作、归档入口、10 秒撤销、共享刷新。
- config/browser.yaml：只添加 Ego 实际核实的入口，作品深链失败保留管理首页提示。
- 临时 fixture 数据库测试标记/撤销/重开/数量；隔离 UI 验收。

## B
- config/publishing.yaml、publishing-config、publishing-media、发布页面：白名单目录、元数据清单、路径引用与指纹复核。
- 上传阶段审计和放弃记录保留原回执；未知结果继续禁止重发，已发布不可删除；仅解除本地关联，不删文件。
- fixture 文件/数据库测试路径穿越、符号链接、文件变化、阶段限制。

## C
- layout-model/store、layouts-page、新富文本组件：版本化文档字段、旧段落无损转换、图片大小、撤销重做、HTML 复制、各平台独立版本。
- 先检查官方 TipTap 文档和已安装依赖；选择最小编辑器包。
- fixture 验证转换、快照冻结、编辑；公众号粘贴如缺登录条件如实记录。

## D
- image-model、media-store、image-generation、新会话组件/持久化：原文与附加说明分开、线程复用、流式文字和返回图片、参考图 1–3、人工裁剪审计。
- 不放宽自动裁剪 2%；fixture 测试裁剪区域与配额/失败历史。

## E
- 复用现有 launchd/attention/collector，实现卸载和过期检查、系统通知与今天提示；只交付安装命令不擅自安装。
- 回复草稿走现有 AI；通用可逆归档独立于 fixture/下架统计；新成片提示复用 B 目录读取。

## 每段完成标准
- 更新有效 PRD 和 design；四问自查、Ego 1440/1728 截图与已知限制放 docs/verification/u9/<段>/README.md。
- npm run format、npm run check；检查不绿时不提交不进入下一段，定位可修编译/测试错误；需用户决定的业务冲突才询问。
- 单独提交并 push，核对远端 SHA；ROADMAP 标 ✅。最后汇总具体提交号。
- 当前用户已明确连续执行，无需重复询问计划或执行方式；不调用子代理。
