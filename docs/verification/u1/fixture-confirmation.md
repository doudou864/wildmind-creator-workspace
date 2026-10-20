# U1 fixture 确认执行（2026-10-20）

用户逐条确认后，仅标记指定 6 条，未进入 U2。

## 备份与迁移

迁移前使用 SQLite online backup（包含 WAL）备份到本机 `data/backups/u1-fixture-confirmation/workspace-2026-10-20T10-03-54-316Z-00000551928834467625-882d9607-303d-40ca-b35f-febe80cd21b0.db`；数据库和备份按项目规则不进入 Git。随后执行 Drizzle 0009，仅为 contents、image_drafts、publish_records 各增加 fixture 布尔字段，默认 false。

`node --experimental-strip-types scripts/mark-confirmed-fixtures.mjs` 先备份/迁移，再在一个事务中仅更新已确认 ID 的 fixture=true；记录缺失即回滚，重复执行不会改其他字段。用户编辑输入不开放 fixture 标记字段。

## 执行结果

- contents：`017cfc52-c228-4df9-809e-6f92744f7428` → fixture=true
- contents：`23c65909-52c5-481f-876e-f9e7bd39dbbe` → fixture=true
- image_drafts：`7269cbfa-c50d-4cf6-b139-537001b93c63` → fixture=true
- publish_records：`92070da1-57ea-4c0b-8a10-54748a7f5fc3` → fixture=true
- publish_records：`9d5ab14c-a613-4af2-a4b4-20a025a6d488` → fixture=true
- publish_records：`0c46b7bd-ef3d-42e0-846d-ef31daaed398` → fixture=true

原始接口仍返回这 6 条及显式标记，正常页面沿用 UI 读取过滤。生图草稿读取转换补充传递 fixture，加载编辑时剥离只读标记，避免污染原来的严格输入校验。

两个真实作品、两条真实消息均未修改；消息总数保持 387。发布确认稿校验、上传/发布安全条件、未知结果禁止重发等代码没有改变。

## 验证

- [真实接口与页面投影验证](fixture-api-verification.json)：6 条原始可查、页面显示 0 条；2 条真实作品和 2 条真实消息全部可见。原始发布记录 3 条，正常发布记录列表 0 条。
- [备份逐表对比](fixture-marking-proof.json)：所有原有业务字段和记录不变；仅新增 fixture 标记。现有定时任务同时更新了 collection_state 的当日 schedule 更新时间，value 未变，未覆盖或回滚该后台状态。
- 迁移后重启本机服务；contents/images/publishing/inbox 四个接口均实际返回 HTTP 200。
- 自动测试覆盖全部 6 个批准 ID 隐藏、其余 4 条真实记录保留、原始记录不变、重复标记幂等。`npm run check` 全绿：39 个测试文件、98 项测试，包含确认稿只读与未知结果禁止重发的现有发布检查。

## Opus5.5 只读调查

[调查结论与待确认修复方案](opus-association-conclusion.md) · [逐平台数据点和关联明细](opus-association-details.md)。没有合并、改日期、改外键或调整 2 天自动匹配窗口。
