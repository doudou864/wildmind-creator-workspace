# 采集诊断与状态修复实施计划

目标：纠正跨日页面误报；让每次采集及启动阻塞能在网页定位，并保留后续诊断证据。
架构：复用 crawl_logs 结果，按记录 UUID 在数据库同目录 execution-logs 写 JSONL；不改表。浏览器与 AI 边界记录开始、耗时、失败；页面按需读取最近记录及执行日志，日期跟随服务端轮询。
技术：现有 TypeScript、Next.js、SQLite、Vitest，无新增依赖。

1. src/jobs/execution-log.ts：独立上下文、同步落盘、错误脱敏、异常透传；隔离测试重启可读、并发分离、敏感信息过滤。
2. crawl-log.ts / collect.ts / ego.ts / structured.ts：接入采集阶段和底层执行事件；不记录脚本、提示词、页面全文或凭据，不改变暂停保护。
3. collection API / collection-strip：返回当前日期与待处理状态，新增按需日志接口和折叠组件。旧日志标明无步骤；完成后消除陈旧启动提示。
4. npm run format / npm run check；Ego 1440/1728 页面核验；不靠修改真实结果制造成功。提交后记入 ROADMAP。
