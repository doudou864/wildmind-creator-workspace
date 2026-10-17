# 基础骨架 Implementation Plan

**Goal:** 先修自动保存，再完成 PRD 13.1 的数据库、配置、登录与日志基础设施。
**Architecture:** 自动保存使用独立的串行合并队列；SQLite 使用 Drizzle 迁移，业务配置运行时读取；浏览器操作封装在 src/browser/。
**Tech Stack:** TypeScript / Next.js / SQLite / Drizzle / better-sqlite3 / YAML / Zod / ego / Vitest。

1. src/ui/use-autosave.ts 与三个编辑页面：保存不占 busy，合并最新输入，离开时 flush；scripts/check-autosave.mjs 检查延迟请求、新输入与错误。验证后单独提交。
2. 对照 PRD 第 8、10 章和服务契约设计 src/db/schema.ts、docs/data-model.md；不能确定的业务口径列待确认。
3. 安装已批准依赖，生成 Drizzle 迁移；实现 WAL、迁移前备份、7 份轮转和抓取日志。Vitest 验证幂等、数据保留与空值。
4. 补全 config/metrics.yaml 与 Zod，验证运行时新增指标；不接入采集。
5. 依据 ego 实际能力封装 src/browser/ 与登录命令，检查真实后台；需用户扫码和重启验证的部分明确交接。
6. 全量 typecheck、build、format:check、Vitest、现有检查；基础骨架单独提交并推送。
