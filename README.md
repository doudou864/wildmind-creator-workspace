# WILDMIND · 野生脑洞工作台

依据 `docs/wildmind-creator-workspace-PRD-v1.7.md` 与 `docs/design.md` 开发的本机业务前端。目前包含总控台、选题中心、生图中心、排版中心、发布中心、互动收件箱、商单列表。正常页面不加载演示数据。

## 运行与检查

Node.js 22 LTS、npm。`npm ci` 后执行 `npm run dev`，打开 http://127.0.0.1:3000 。服务仅监听本机。

- `npm run typecheck`：严格类型检查。
- `npm run build`：生产构建（Webpack）。
- `node --experimental-strip-types scripts/check-business.mjs`：业务边界断言，不安装新测试依赖。
- `node --experimental-strip-types scripts/check-layouts.mjs`：排版独立编辑、确认与配图边界断言。
- `node --experimental-strip-types scripts/check-publishing.mjs`：发布来源、封面映射、确认稿只读、定时与重试边界。
- `node --experimental-strip-types scripts/check-inbox.mjs`：回复证据、会话去重、三分类、主题来源、选题同步边界。
- `node --experimental-strip-types scripts/check-deals.mjs`：商单三状态、来源保护、修订冲突、建议确认和今日行动口径。
- `npm start`：启动生产服务（先停止开发服务）。

## 已实现的前端

- `/` 总控台：平台与日期筛选、数据健康、粉丝与趋势、近期作品、逐检查点详情、D1/D3 异常、按平台/月/FIRE 分组的命中率展示。缺失和未接入数据显示 `--`。
- `/topics` 选题中心：来源、状态、FIRE/探索筛选；单记录版本化操作接口；首次选择标记与完整证据定格规则；停用渠道保留历史候选；可进入关联选题的生图中心。
- `/images` 生图中心：六种用途、主题/正文、关联选题/作品、配置风格与比例、按段落配图、已有图复用、素材筛选/详情/版本、自然语言改图要求、草稿与本地图片预览、未保存离开提醒。

- `/layouts` 排版中心：来源结构识别、三版并排独立编辑、段落排序/配图、公众号双封面、抖音竖版图集与滑动预览、X 简化结构、独立确认与交接操作边界、未保存提醒。

- `/publishing` 发布中心：视频、排版确认稿、小红书图文三个入口；本机文件预览、按作品自动带出封面、逐平台文案/标签/时间、复制文案、人工核对清单、批次与逐平台回执。确认稿只读，未知结果禁止重发。

- `/inbox` 互动收件箱：评论/私信、平台/分类/回复状态筛选、搜索、分页、原文与上下文、读取与分类证据、需求主题来源、商单自动流转状态和选题同步入口。平台全程只读；私信按会话去重计待回复，不提供手工状态标记。

- `/deals` 商单列表：三状态概况、平台/来源/状态筛选、搜索分页、品牌与需求详情、原消息定位、编辑保护、带证据的状态建议确认。与收件箱互相定位，总控台计数与商单待回复行动共用商单读取服务。

## 当前服务状态

按用户本轮决定，**不安装新依赖，不实现数据库、上传存储或 AI 服务**。`src/lib/workspace-service.ts` 是正式服务接入边界：返回空业务记录和不可用能力标记，不返回假数据。写入与生成接口返回 HTTP 503，页面禁用对应操作并显示原因。

表单填写和本地图片预览只存在于当前页面，**没有保存或上传**。素材版本、选题持久化与真实生成须在服务接入后才能使用。旧演示资料移到 `tests/fixtures/`，不被运行页面导入；旧浏览器演示键未读取、未迁移、未删除。

后端接入契约和原子更新要求见 `docs/service-contracts.md`。未接入真实采集或复盘算法，本轮不宣称 PRD 第 1–10 步业务闭环完成。

## 配置

- `config/platforms.yaml`、`config/metrics.yaml`：平台与当前前端使用的指标子集。
- `config/parameters.yaml`：检查点、异常阈值、复盘平台、样本门槛与候选数量。
- `config/选题输入渠道.md`：内置及外部来源，停用仅影响后续生成。
- `config/deals.yaml`：商单三状态名称与说明、分页大小、品牌与需求字段长度。
- `config/inbox.yaml`：三种业务分类、评论/私信类型与列表分页大小。
- `config/publishing-templates.yaml`：发布来源、平台封面映射、模板、文件限制和图数上限；未知的平台限制与观看时段保持空值，未核验模板阻止实际发布。
- `config/layout-styles.yaml`：固定正文风格、排版平台、公众号封面比例、抖音配图比例与工作台图数上限。
- `config/image-styles.yaml`：生图用途、比例、风格、参考来源与上传限制。

`src/ui/` 统一管理组件、样式、字体与图表。字体许可见 `public/fonts/OFL.txt`；配置在页面请求时读取并校验。验收记录和截图保存在 `docs/verification/`。
