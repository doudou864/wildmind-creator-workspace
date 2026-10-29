# WILDMIND · 野生脑洞工作台

依据 `docs/PRD.md`（v1.10 基础及后续确认修订）与 `docs/design.md` 开发的本机工作台。目前包含总控台、选题中心、生图中心、排版中心、发布中心、互动收件箱、商单列表。正常页面不加载演示数据。

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

## 当前能力与进度

以 [PRD](docs/PRD.md) 为现役需求入口，以 [ROADMAP](docs/ROADMAP.md) 的当前总览为进度入口；早期版本和验收记录保留历史语境。

- 总控台、作品页与数据中心：读取 SQLite 真实数据，提供检查点复盘、趋势和独立抖音播放量中位数；缺失不补零。
- 采集：五平台适配器、独立后台任务、停止/恢复、执行日志和备份已接通。四平台自动调度，视频号仅手动；执行成功与平台数据日期分开，详见 [采集契约](docs/collection-contract.md)。
- 选题：来源渠道可编辑，后台研究、实体与观看角度起草、独立复核、反馈及进度持久化；材料不足不凑20条。
- 生图：持久对话、新建/搜索/重命名/归档恢复、比例与本机技能选择、原图展示；使用本机 ChatGPT 套餐。
- 排版：三版独立保存、AI 修改和确认快照；互动与商单读取本地采集结果，不自动回复平台。
- 视频发布：主题、标签、三种封面、本机视频路径；独立上传任务、审核后发布或直接发布、暂停/恢复、逐平台回执、浏览器丢失恢复。已提交或结果未知的目标禁止重复提交。

数据库、自动保存、AI 和发布后台均已接通，不能再按“只做了前端、合法写入均返回503”理解。能力接通不等于所有平台全流程无人接管验收完成：连续多日采集、真实样本与新视频全链路边界见 ROADMAP。平台登录、审核与公开状态会变化，历史回执不是实时保证。

## 版本管理与本机数据

代码、配置、迁移、测试和文档通过 Git 管理；`data/`、`.env*`、依赖和构建缓存被忽略。GitHub 恢复代码不会恢复数据库、素材或浏览器登录。换机时另行备份本机数据，并检查配置中的本机路径与 Codex 登录。

提交前运行 `npm run format`、`npm run check`；构建用 `npm run build`。保留已有提交历史，正常推送，不强推。配置与文档可能包含公开账号、来源网址和验收截图，当前远端为公开仓库。

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

登录需要本机 ego-browser 已安装、可以启动；首次使用前运行 `ego-browser skill`。`data/browser/` 保存所需域名的 Cookie 与当前后台 localStorage，目录权限 700、文件权限 600，不进 Git。优先复用 ego 自身已有会话；cookie 文件只作为备份，程序不自动注入 Cookie 或 localStorage。平台主动过期的登录仍需重新扫码，不能保证永不失效。视频号已实测微信快捷登录及登录后账号区域；电脑微信已登录时，可在登录页点击“微信快捷登录”，不必重复扫码。

`config/browser.yaml` 管理后台地址与已实测的页面标记。所有配置文件均在运行时读取，修改后重启服务即可生效，不需要重新构建；当前已打开页面需刷新。`metrics.yaml` 的每个 binding 明确平台、形式、级别、页面、方式、频率和确认状态；pending 不作为已验证采集规则。指标 ID 永不复用，正式指标停用设 dropped。

数据字段与已确认口径：[data-model.md](docs/data-model.md)。`src/jobs/crawl-log.ts` 提供开始和结束函数，结束后自动备份；第 2 步采集接入时直接调用。第 2 步采集实现与运行验收见文末；业务前端仍待后续步骤接入。

## 抖音采集（ROADMAP 第 2 步）

- `npm run collect`：立即采集抖音；首次及日常都只采近 30 天的视频和图文，详情按检查点/补抓/异常进入。
- `npm run collect:attention`：查看“需要你处理”。
- `npm run collect:resume`：处理登录/风控后继续待处理的平台。
- `npm run collect:install`：安装本机 launchd；按 `config/parameters.yaml` 的时间窗口选择每日随机时间，失败按重试时间执行。轮询间隔取 `config/collection.yaml`，同一时刻只有一个采集任务。
- 验证码/登录中断只记录并通知，不破解、不输入密码。视频号微信确认由轮询检测，23:00 到期写“未确认登录”；视频号采集器本身按第 3 步接入。
- `config/ai.yaml` 的 model 为 null 时使用本机 Codex 默认模型；截图识别通过经批准安装的 Codex SDK。失败不填写估计值。
- 截图与识别 JSON：`data/captures/`；运行日志：`data/jobs/collector.log` 与 `collector-errors.log`；数据库每次结束采集后备份，保留 7 份。
- 审查 A 的三天运行和人工抽查须另外通过，不能仅凭自动测试宣称完成。
