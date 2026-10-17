# 总控台前端 Implementation Plan

**Goal:** 在 1440px、1728px 桌面宽度下还原工业仪器面板，完成可交互总控台前端。

**Architecture:** Next.js App Router 服务端读取 YAML 并用 Zod 校验，向客户端提供平台、指标及展示参数。演示数据与配置、组件分离；ECharts 与基础组件统一放在 src/ui。当前不接数据库、浏览器采集、AI 或发布。

**Tech Stack:** TypeScript strict、Next.js、React、Tailwind CSS、ECharts、YAML、Zod、npm。

## 范围与取舍

- 用户已明确批准先做总控台前端及安装所列依赖，覆盖 PRD 第 13 章的数据先行顺序，本次不宣称完成第 1–5 步完整业务验收。
- 实际需求来源为 docs/wildmind-creator-workspace-PRD-v1.7.md，AGENTS.md 中 docs/PRD.md 不存在。
- 直接采用现有 design.md 与参考图；不增加其他视觉方向。
- 空值显示遵循具体设计规范的 `--`；粉丝补充 PRD 要求的总数折线。
- 商单先为 0，需求主题为空；其他板块导航禁用并标明后续开发。
- 默认演示数据明确标注，支持切换无数据状态，不能将演示状态描述为真实采集。

## 实施与验收

1. 建立最小工程：package.json、TypeScript、Tailwind、根布局。安装已批准依赖，保留 lockfile；不添加无关库。
2. 建立 config/platforms.yaml、metrics.yaml、parameters.yaml 与 Zod 校验加载器。配置每次请求读取；非法配置报错，不静默回退。
3. src/ui 实现卡片、按钮、切换器、格子条、原生可访问对话框及 ECharts 统一主题。src/app 实现顶栏、健康条和三栏总控台。
4. 验证平台/指标/时间范围切换、作品详情、日志与重抓边界、无数据状态。数值格式区分 0 和 null；倍数使用配置命中阈值，样本不足不呈现伪倍数。
5. 运行严格类型检查与生产构建。用 ego 在 1440 与 1728 两种宽度截图，检查布局、字体、颜色、溢出、图表与键盘交互。
6. 保存验收说明和运行方法，初始化本地 Git 并提交。没有远程推送。

## 明确不包含

数据库迁移、采集与重试、复盘算法、持久化商单/选题、其他板块页面及一键发布；这些仍按 PRD 后续步骤实现。
