# 选题采集容错与后台进度实施计划

**Goal:** 单站失败不阻断可用选题；刷新、离开后仍可看到同一任务，重复点击不重复付费。

**Architecture:** 复用 topic_generation_tasks 和 collection_state 持久化阶段、逐渠道结果及进程身份，不改表、不加依赖。独立 Node 后台任务运行采集与生成，网页只提交任务和读取状态。每个网页读完立即提取并保存线索；失败记录原因继续下一站。有限滚动所得原文可用但标明范围；没有证据不得凑数。

**Tech Stack:** 现有 TypeScript、Next、SQLite/Drizzle、Codex SDK、ego、Vitest。

## 范围与选择

用户已明确授权实施。简单去掉失败抛错仍不能解决刷新状态；仅前端轮询长请求仍依赖页面服务生命周期，因此采用独立后台进程。保留用户接管浏览器时的停止规则。既有未提交渠道和 ROADMAP 内容不覆盖。

## 单步实现与验证

1. `src/browser/topic-source.ts`：逐来源回调、读取上限保留原文、登录/网络原因记录，控制权异常停止。用模拟网页测试继续下一站与停止边界。
2. `src/lib/topic-store.ts`：部分成功继续生成，进度逐步写入，优先本轮来源、历史回退明示，允许有依据的少量候选，保留原子保存及来源验证。临时数据库测试混合成功、全失败、历史回退和不可用引用。
3. `src/jobs/topic-generation.ts`、`scripts/generate-topics.mjs`、生成接口：独立进程、跨请求互斥、失活任务明确失败，不自动重启。临时数据库/测试子进程检查重复启动与恢复。
4. `src/app/topics/topics-page.tsx`、`src/ui/topic-generation-status.tsx`：候选上方小状态框、阶段/耗时/失败清单、自动轮询、刷新恢复、防重复按钮。ego 隔离 fixture 两档截图与刷新/离开回来验收。
5. `npm run format`、`npm run check`、typecheck/build；交付验证报告，提交本轮文件，再更新 ROADMAP。本轮不真实触发采集和 AI，不修改真实候选。
