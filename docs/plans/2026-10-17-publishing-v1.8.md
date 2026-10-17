# 发布中心 v1.8 Implementation Plan

**Goal:** 一次填写通用文案，生成平台版本；上传与最终发布分开，截图审核和过期控制可验收。
**Architecture:** 在现有发布模型增加通用文案、单独修改标志、上传回执。纯函数负责派生文案与就绪判断，页面只编排交互；服务继续返回真实未接入状态。
**Tech Stack:** 现有 Next.js / React / TypeScript / YAML / Zod，无新增依赖。

1. 先更新 PRD 6.5、第 13 章相关描述、第 15 章决策记录，建立 docs/PRD.md 当前版本入口。保留 v1.7 历史。
2. 更新 src/lib/publishing-model.ts、config/publishing-templates.yaml、parameters.yaml、接口和 docs/service-contracts.md。检查脚本覆盖通用同步/保护/恢复、无截断、格式、过期、截图、就绪筛选、重试与幂等输入。
3. 修改 publishing-page.tsx 和 src/ui/publishing.css：通用文案、收起摘要、问题展开、截图审核；use-resource.ts 统一中文请求错误。
4. typecheck、所有现有检查、build。用 ego-browser 在 1440/1728 截图并做实际交互检查；隔离浏览器测试数据仅用于验收，不写进业务服务。
5. 写验收记录，提交 git 并推送 GitHub，核对远端提交与本地一致。交付后才进入第 13 章第 1 步，本次不建数据库。
