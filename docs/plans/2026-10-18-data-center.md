# 数据中心 Implementation Plan

**Goal:** 只读抖音快照，解释单条作品与较早同形式历史作品的差异。

**Architecture:** src/core/data-center.ts 纯计算，复用 src/core/review.ts 的时间/检查点取值，并提取共享 quantile。src/lib/data-center-store.ts 读快照，页面现算；唯一新表保存 AI 解读与数字表指纹。src/app/data-center 提供作品选择/曲线/逐项对比/按需解读，图表在 src/ui 复用现有 ECharts。

**Tech Stack:** 现有 TypeScript、Next、ECharts、SQLite/Drizzle、Zod、Vitest，无新增依赖。

1. 先合并 v1.10（新增决定109–117），记录真实验收门槛。
2. 给 config/metrics.yaml 补方向，config/data-center.yaml 配平台、天数、互动归一化指标和 AI 模板；编写 src/core/data-center.test.ts 验证分位数、同龄、先发对比池、空值、补抓、方向和每千播放，后实现纯函数。
3. schema.ts 只加解读表；在线备份后生成并检查迁移，再迁移。本机真实数据不插测试作品。
4. 实现只读数据服务与按钮 POST 解读；AI 只接收数字表，引用行号由代码拼数字，拒绝新增数字，150字限制；缓存与同请求去重。
5. 实现页面、共用图表、导航和抖音近期作品跳转。其他平台仍保留原详情。
6. check/build、三条真实作品独立核算、AI按需与刷新验证、1440/1728截图。提交后更新ROADMAP，真实正常范围验收继续待样本。
