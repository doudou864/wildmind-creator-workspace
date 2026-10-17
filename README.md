# WILDMIND · 野生脑洞工作台

依据 `docs/PRD.md（当前 v1.8）` 与 `docs/design.md` 开发的本机工作台。目前包含总控台、选题中心、生图中心、排版中心、发布中心、互动收件箱、商单列表。正常页面不加载演示数据。

## 运行与检查

Node.js 22 LTS、npm。`npm ci` 后先执行 `npm run db:migrate`，再执行 `npm run dev`，打开 http://127.0.0.1:3000 。服务仅监听本机。

- `npm run format`：格式化 src/ 和 scripts/（120 字符行宽）；提交钩子自动执行，格式变化后需重新暂存。
- `npm run format:check`：检查格式。
- `npm run typecheck`：严格类型检查。
- `npm run build`：生产构建（Webpack）。
- `node --experimental-strip-types scripts/check-business.mjs`：业务边界断言，保留原检查脚本。
- `node --experimental-strip-types scripts/check-layouts.mjs`：排版独立编辑、确认与配图边界断言。
- `node --experimental-strip-types scripts/check-publishing.mjs`：发布来源、封面映射、确认稿只读、定时与重试边界。
- `node --experimental-strip-types scripts/check-inbox.mjs`：回复证据、会话去重、三分类、主题来源、选题同步边界。
- `node --experimental-strip-types scripts/check-deals.mjs`：商单三状态、来源保护、修订冲突、建议确认和今日行动口径。
- `npm start`：启动生产服务（先停止开发服务）。

## 已实现的前端

- `/` 总控台：平台与日期筛选、数据健康、粉丝与趋势、近期作品、逐检查点详情、D1/D3 异常、按平台/月/FIRE 分组的命中率展示。缺失和未接入数据显示 `--`。
- `/topics` 选题中心：来源、状态、FIRE/探索筛选；单记录状态自动保存接口；首次选择标记与完整证据定格规则；停用渠道保留历史候选；可进入关联选题的生图中心。
- `/images` 生图中心：六种用途、主题/正文、关联选题/作品、配置风格与比例、按段落配图、已有图复用、素材筛选/详情/版本、自然语言改图要求、草稿自动保存与本地图片预览、选定即作品采用。

- `/layouts` 排版中心：来源结构识别、三版并排独立编辑、段落排序/配图、公众号双封面、抖音竖版图集与滑动预览、X 简化结构、一次确认并送去发布、自动保存。

- `/publishing` 发布中心：视频、排版确认稿、小红书图文三个入口；本机文件预览、按作品自动带出封面、通用文案一次填写、自动生成平台版本、单独修改与恢复、问题展开、上传后截图审核、两小时过期、一次确认全部发布、最近发布记录只读回看与逐平台回执。确认稿只读，未知结果禁止重发。

- `/inbox` 互动收件箱：评论/私信、平台/分类/回复状态筛选、搜索、分页、原文与上下文、读取与分类证据、需求主题来源、商单自动流转状态和选题同步入口。平台全程只读；私信按会话去重计待回复，不提供手工状态标记。

- `/deals` 商单列表：三状态概况、平台/来源/状态筛选、搜索分页、品牌与需求详情、原消息定位、编辑保护、带证据的状态建议确认。与收件箱互相定位，总控台计数与商单待回复行动共用商单读取服务。

## 当前服务状态

PRD 第 13 章第 1 步已建立 SQLite / Drizzle 数据底座、配置加载、浏览器登录检查与抓取日志。业务页面的存储/AI/发布接口尚未接入：`src/lib/workspace-service.ts` 是正式服务接入边界：返回空业务记录和不可用能力标记，不返回假数据。写入与生成接口返回 HTTP 503，页面禁用对应操作并显示原因。

表单填写和本地图片预览只存在于当前页面，**没有保存或上传**。素材版本、选题持久化与真实生成须在服务接入后才能使用。旧演示资料移到 `tests/fixtures/`，不被运行页面导入；旧浏览器演示键未读取、未迁移、未删除。

后端接入契约和原子更新要求见 `docs/service-contracts.md`。未接入真实采集或复盘算法，本轮不宣称 PRD 第 1–10 步业务闭环完成。

## 配置

- `config/platforms.yaml`、`config/metrics.yaml`：平台与 PRD 第 8 章完整指标字典（含待核对和舍弃项）。
- `config/parameters.yaml`：检查点、异常阈值、复盘平台、样本门槛与候选数量。
- `config/选题输入渠道.md`：内置及外部来源，停用仅影响后续生成。
- `config/deals.yaml`：商单三状态名称与说明、分页大小、品牌与需求字段长度。
- `config/inbox.yaml`：三种业务分类、评论/私信类型与列表分页大小。
- `config/publishing-templates.yaml`：发布来源、平台封面映射、模板、文件限制和图数上限；未知的平台限制与观看时段保持空值，未核验模板阻止实际发布。
- `config/layout-styles.yaml`：固定正文风格、排版平台、公众号封面比例、抖音配图比例与工作台图数上限。
- `config/image-styles.yaml`：生图用途、比例、风格、参考来源与上传限制。

`src/ui/` 统一管理组件、样式、字体与图表。字体许可见 `public/fonts/OFL.txt`；配置在页面请求时读取并校验。验收记录和截图保存在 `docs/verification/`。

## 基础骨架命令

在项目根目录运行：

- `npm run db:migrate`：创建/升级 `data/workspace.db`，自动开启 WAL；每次迁移前备份到 `data/backups/`，只保留最近 7 份。可重复执行。
- `npm run db:generate`：根据 schema 生成增量迁移，不能直接 push 改表；执行迁移仍用上一条命令。
- `npm run browser:login -- douyin`：打开后台。已有登录会直接检查并保存；未登录时交给你扫码，成功后在终端按回车保存。其他平台 ID：xiaohongshu、bilibili、channels、youtube。
- `npm run browser:check`：检查 5 个在发平台；也可追加 `-- douyin` 只检查抖音。状态为已登录/未登录/待核对；有未就绪项时退出码为 1，不自动重新登录。
- `npm test`：Vitest 后端测试（临时数据库，不修改你的业务记录）。
- `npm run check`：运行所有原有检查和新增自动保存检查。

登录需要本机 ego-browser 已安装、可以启动；首次使用前运行 `ego-browser skill`。`data/browser/` 保存所需域名的 Cookie 与当前后台 localStorage，目录权限 700、文件权限 600，不进 Git。优先复用 ego 自身已有会话；新环境无对应 Cookie 时从文件恢复，然后重新核实后台。平台主动过期的登录仍需重新扫码，不能保证永不失效。视频号登录后的识别标记目前待扫码实测，不凭菜单猜成功。

`config/browser.yaml` 管理后台地址与已实测的页面标记。所有配置文件均在运行时读取，修改后重启服务即可生效，不需要重新构建；当前已打开页面需刷新。`metrics.yaml` 的每个 binding 明确平台、形式、级别、页面、方式、频率和确认状态；pending 不作为已验证采集规则。指标 ID 永不复用，正式指标停用设 dropped。

数据字段与待确认问题：[data-model.md](docs/data-model.md)。`src/jobs/crawl-log.ts` 提供开始和结束函数，结束后自动备份；第 2 步采集接入时直接调用。当前没有执行数据抓取或 AI 识别。
