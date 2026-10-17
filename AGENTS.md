# AGENTS.md

单人使用、运行在本机 Mac 上的自媒体运营工作台。需求以 `docs/PRD.md` 为准；不清楚就问，不要猜。

## 技术栈

| 用途 | 选型 |
|---|---|
| 语言 | TypeScript（strict）、Node.js LTS、npm |
| 界面 | Next.js（App Router） |
| 样式 / 组件 | Tailwind CSS + shadcn/ui（只用交互骨架，外观按 `docs/design.md` 重画） |
| 图表 | ECharts |
| 字体 | JetBrains Mono（数字、英文）+ 苹方（中文） |
| 数据库 | SQLite（WAL）+ Drizzle ORM + better-sqlite3 |
| 配置 | YAML + Zod 校验 |
| 浏览器 | ego lite（`ego-browser`）；备用 Playwright + Chrome |
| AI | Codex CLI / SDK（本机 ChatGPT 登录）；生图只走套餐额度，不用 API |
| 定时 | macOS launchd |
| 测试 | Vitest |

不得更换技术栈；新增依赖要先征得用户同意。

## 目录

```
config/        平台、指标字典、参数、模板、风格、选题输入渠道.md
src/app/       页面，一个板块一个文件夹
src/ui/        通用组件、设计变量、ECharts 主题
src/core/      复盘算法（纯函数）
src/db/        schema、migrations
src/browser/   浏览器统一接口（ego / Playwright 两种实现）
src/collectors/<平台>/  平台适配器
src/ai/        AI 调用层
src/jobs/      定时任务入口
data/          数据库、素材、截图、备份（不进 git）
```

## 约束

**平台**
- 对平台只读；唯一的写操作是发布，必须由用户一键确认。
- 不用平台 API 和第三方数据服务。
- 操作浏览器必须遵守 PRD 浏览器使用规则。
- 识别失败就记为失败并写明原因，不填估计值。

**代码**
- 平台、指标、阈值、模板、模型名都从 `config/` 读取，不写死。
- 业务代码只通过 `src/browser/` 操作浏览器，不直接调用 ego 或 Playwright。
- 用 ego 之前先读 `ego-browser` skill；平台页面结构要打开真实页面确认，不凭记忆写。
- AI 读截图必须返回固定的 JSON 结构，并用 Zod 校验。
- 密钥只放 `.env.local`，不进 git，也不写进日志。

**数据库**
- 作品数据和账号数据存长表（一行一个数）。增删指标只改 `config/metrics.yaml`。
- 指标 `id` 永不复用；不要的指标设为 `dropped`，历史数据保留。
- 改表结构前先备份 `workspace.db`，用 Drizzle 迁移，只加不删。
- 图片、截图、CSV 存成文件，数据库只存路径；每次抓取后自动备份数据库，保留 7 份。

**前端**
- 做界面之前先读 `docs/design.md`，并对照 `docs/design-reference.webp`。
- 只用 design.md 里定义的设计变量；组件和图表主题放在 `src/ui/` 复用。
- 页面做完用 ego 截图，按 design.md 的验收清单自查。

**流程**
- 按 docs/ROADMAP.md 一次只做一步；每步做完自测完成标准、npm run check 全绿、提交 git，然后在 ROADMAP.md 里更新状态并写一行记录，接着做下一步。
- 🔍 A/B/C/D 写汇报文件后继续；只有 🔍 E（真实上传前）和 🔍 F（每个平台首次真实发布前）必须停下，用大白话汇报并等用户确认。
- `src/core/` 必须有测试，覆盖 PRD 第 7 章的边界情况。
- 不可撤销的操作（删数据、强推代码等）要先征得同意。
- 用中文大白话和用户沟通。每一步结束时说清楚：做了什么、怎么验收、需要用户做什么。

**格式**
- 每次提交前运行 `npm run format`，行宽 120；格式化范围为 src/ 和 scripts/。提交钩子会检查已暂存内容与格式化结果一致。
