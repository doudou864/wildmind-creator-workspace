# U8 Implementation Plan

**Goal:** 按 u8-batch.md 的 A→E 完成已批准合并、页面修正与四入口创作流程。
**Architecture:** 保留平台 post 身份、采样和冻结结果；合并仅改明确引用并新增可追溯指向。页面复用现有读取与编辑组件，URL 携带作品上下文。实测仅用显式 fixture，真实数据只读核对。
**Tech Stack:** 现有 Next.js / TypeScript / SQLite / Drizzle / Vitest / Ego，不新增依赖。

## A
先备份；src/db/schema.ts 增加作品合并指向；Drizzle 迁移；单用途事务脚本迁移引用并保留旧档。用临时数据库测试事务与数据不变，真实库仅执行已批准合并；保存前后计数及 hash。UI 读取隐藏合并旧档，原始 API 可追溯。截图、format/check、提交推送。
## B
src/app/dashboard.tsx、inbox/inbox-page.tsx、data-center/data-center-page.tsx 及 src/ui/ 展示层：统一日期/计数命名、减少重复与空值、折叠筛选、sticky、指标分组和真实次数。只读核对，不重新分类或改采样。双宽截图和四问；format/check、提交推送。
## C
src/ui/ 通用导航；新增作品入口，嵌入现有数据组件；保留旧路径与参数；消息组内切换。只读路由走查、双宽截图；format/check、提交推送。
## D
复用四个创作页的主体，新增上下文外壳，URL 保留 content/topic/layout。视频隐藏排版；落实各页空态、素材筛选、排版平台切换和发布缺项。用显式 fixture / 内存组件预览测试交接，不操作真实稿件。format/check、截图、提交推送。
## E
查生成参数与返回尺寸证据，不放宽校验；按确认 ID 标记 U6 产物，保持首次定格不变。需要新增 fixture 字段时备份并作加法迁移。冻结及命中率回归测试，截图、format/check、提交推送。汇总所有提交和待决项。
