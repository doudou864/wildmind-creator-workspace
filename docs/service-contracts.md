# 前端服务接入契约

单人本机，自动保存，最后保存为准。仅发布和后台并发保留版本检查。类型/校验见 src/lib/*-model.ts，参数来自 config/。

当前数据库 CRUD、AI、素材存储和平台发布后台均已接入。具体入口以 `src/app/api/`、服务实现以 `src/lib/` 和 `src/jobs/` 为准；下表为契约摘要，不是完整路由清单。不存在记录返回404，业务不允许返回422，版本冲突返回409；503只用于实际能力不可用，不再代表全部写接口。当前能力与实站验收边界见 [ROADMAP](ROADMAP.md)。

生图的现役交互是持久对话（`src/lib/image-conversations.ts`、`/api/images/chat/sessions`），下文用途草稿接口仍服务兼容数据，不能据此恢复旧用途表单。视频发布现役要求以 [PRD](PRD.md) 的后续修订为准；直接发布授权、任务恢复和逐平台防重由后台校验。

## 共同约定

- 普通编辑没有 expectedRevision、409 冲突弹窗或未保存离开提醒；记录保留 updatedAt。输入停止后自动保存，不占用操作 busy、不禁用输入；角落显示保存状态。请求串行执行，在途新编辑只保留最新一份，前一次结束后继续保存；离开时 flush，JSON 请求 keepalive。失败显示中文原因并保留输入，不无限重试。关闭/刷新窗口可能丢失尚未保存的编辑；服务未接入时必须明确说明。
- 发布记录及回执保留 revision；收件箱、后台聚合主题、商单、选题生成任务/结果保留各自并发版本。选题状态选择不要求版本；后台生成结果写入只能更新对应生成字段，不能覆盖用户状态和首次定格。
- 写入返回真实记录，未知数字显示 --。读取失败保留已有内容；重新聚焦刷新读取。
- 文件写入 data/ 下服务生成的路径，数据库只存路径。客户端仅传资产 ID，不能传任意文件路径。真实接入须解码检查字节、MIME、尺寸与可读性，不能只信客户端元数据。
- 发布只经 src/browser/ 操作真实页面，不用平台 API；其他平台操作只读。客户端 materials 只是核对材料，服务必须根据真实状态重算。

## 读取接口

| 接口 | 返回 | 口径 |
|---|---|---|
| GET /api/dashboard | DashboardData | 检查点、命中率、待办及各来源就绪状态 |
| GET /api/topics | TopicData | 保留全部候选与历史，未知 d21Samples 为 null |
| GET /api/contents | ContentData | id/title/topicId/form/plannedDate/videoCovers/updatedAt |
| GET /api/images | ImageData | 素材、草稿、真实作品和选题，存储/生成能力 |
| GET /api/layouts | LayoutData | 独立三版稿件、素材、作品及存储/AI/交接能力 |
| GET /api/publishing | PublishingData | 作品、成片、素材、确认稿、发布记录、回执、账号、本月推荐及能力 |
| GET /api/inbox | InboxData | 本机消息、主题、读取时间和失败原因，不触发抓取 |
| GET /api/deals | DealData | 本机商单、关联消息和会话证据，不触发抓取 |
| GET /api/images/assets/:id/file | 图片字节 | 按资产 ID 读取，MIME 取核验结果；截图也是不可变资产 |
| GET /api/publishing/media/:id/file | 成片字节 | 受控路径，接入后支持 Range |

## 总控台与选题

检查点与命中率遵守 PRD 第 7 章口径，前端不重算定格值，补抓标明真实时间。

| 写接口 | 输入 → 返回 | 处理 |
|---|---|---|
| PATCH /api/topics/:id | {status: candidate/selected/skipped} → Topic | 自动保存单条状态，最后保存为准；已发布不可退回 |
| POST /api/topics/generate | 无客户端样本参数 → 任务 | 每次读取启用渠道；数量、探索配额与 FIRE 门槛取配置；任务和生成结果写入做版本保护 |
| POST /api/dashboard/themes/:id/topic | {expectedRevision} → {themeId,signalId} | 后台主题并发核对，按稳定主题 ID 幂等创建 TopicSignal，保留真实消息来源 |

首次选中在事务中定格 FIRE 与完整证据，之后恢复、重选或数据变化均保留快照。客户端不能提交定格字段。停用渠道不删历史。

今日行动依据计划和真实发布状态；来源不完整不能显示无待办。异常保留证据时间和原因。

## 作品、生图与素材

| 写接口 | 输入 → 返回 | 处理 |
|---|---|---|
| POST /api/contents | {title,topicId,form,plannedDate} → Content | 创建并关联，核验选题；同一选题可有多条作品 |
| POST /api/contents/:id/covers | {ratio,assetId:string或null} → Content | 设置/解除此比例采用；核验同作品、video_cover、真实尺寸与文件；自动保存，无修订号 |
| POST /api/images/drafts | ImageDraftInput → ImageDraft | 自动创建文字草稿，核验用途/风格/比例/关联 |
| PATCH /api/images/drafts/:id | ImageDraftInput → ImageDraft | 自动保存，以最后保存为准 |
| POST /api/images/generate | ImageDraftInput → 任务 | 重新计算缺失输出；修改单图保留原图及比例，生成新版本 |
| POST /api/images/assets | multipart file + metadata | metadata={title,purposeId,topicId,contentId,prompt,parentAssetId}，返回真实资产；版本继承家族、用途与比例 |
| PATCH /api/images/assets/:id | {title,purposeId,topicId,contentId} → Asset | 自动保存元数据，保留来源和文件；不得破坏已冻结快照，业务不允许返回 422 |
| POST /api/images/assets/:id/select | {} → {asset,content} | 一次事务选定版本；有关联作品就同时采用，无关联只设置默认版本 |

选版只改变本家族的 selected；视频封面同时原子更新 Content.videoCovers[ratio]，其他比例和家族默认不变。关联普通配图通过作品关联和本家族 selected 表达采用，不改已冻结确认稿。无作品时 content=null。禁止先选版成功、再单独请求采用而形成半成功。

上传填写实际 purposeId，source=upload；固定比例校验真实尺寸，允许自由比例的素材不裁切。首次视频封面生成三比例、公众号生成两比例；这不代表发布必须凑齐所有比例。

文字保存不代表文件入库，生成须有状态读回。

## 排版中心

| 写接口 | 输入 → 返回 | 处理 |
|---|---|---|
| POST /api/layouts | {contentId,source,variants} → LayoutDocument | 自动创建稿件，关联图文作品 |
| PATCH /api/layouts/:id | 同创建输入 → LayoutDocument | 自动保存；无修订号，最后保存为准；已送出版本须先退回 |
| POST /api/layouts/:id/actions | {platform,action:confirm-send/revise/ai,instruction?} → LayoutDocument | 按以下动作处理，无 expectedRevision |

三版独立，variants 不接受状态与时间；X 引用转正文，不执行 HTML。

- confirm-send：一个按钮、一次确认框；原子检查文字、作品、配图和真实尺寸，创建不可变确认快照并置 sent。重复交接返回同一快照，不建立第二份待发稿，也不点击平台发布。
- revise：撤回待发快照并恢复 draft，使对应上传截图失效。执行中、已发布或结果未知不可退回，返回 422；保留“退回修改”入口。
- ai：instruction 非空，只修改指定未送出版本；完成后返回稿件。若采用异步任务，必须先具备状态读回及后台写入保护再打开 aiReady。

微信双封面、抖音配图比例/数量均从配置校验；默认数量是工作台值，不冒充平台已核验限制。记录仅 draft/sent 和 updatedAt。快照记录 layoutUpdatedAt 和明确文件版本。

## 发布中心

用户只有“上传到各平台”和“全部发布”两个主要按钮。选择本机文件自动上传保存，编辑自动保存；没有手动保存或新建批次。最近的发布记录仅供只读回看。选择作品恢复待办，创建接口按作品/来源复用未完成记录。

| 写接口 | 输入 → 返回 | 处理 |
|---|---|---|
| POST /api/publishing/media | multipart metadata={kind:video/xhs,contentId} + files → {videoId,assetIds} | 自动存储本机素材，校验归属、字节及配置限制；小红书自制图 source=upload |
| POST /api/publishing/drafts | PublishDraft → PublishBatch | 自动建立或恢复当前作品的发布准备 |
| PATCH /api/publishing/drafts/:id | PublishDraft → PublishBatch | 自动保存，无 expectedRevision；执行中不可改，更新发布执行版本 |
| POST /api/publishing/ai | {action:ai,draft,instruction} → PublishDraft | 直接使用当前编辑，无需先保存；返回校验过的通用文案，保留单独修改平台 |
| POST /api/publishing/drafts/:id/actions | 下述动作 → PublishBatch | 上传、发布、确认稿退回 |
| POST /api/publishing/receipts/:id/retry | {expectedRevision,requestId:UUID,confirmed:true,materials} → 回执/任务 | 仅重试已核实未发布的安全失败 |

PublishDraft 三类来源不可混用。通用文案只填一次，未单独修改的平台自动跟随；修改平台字段后保留整份独立设置，恢复通用时重建默认值。只打开卡片不算改动。标题/简介不截断，Unicode 字符计数。话题包裹格式取模板。时间取本月推荐或模板，已过则明日；无值为 null（立即发布），时区 Asia/Shanghai。

封面仅检查所选平台的模板比例，缺失就在该平台卡片提示并链接生图中心。只选抖音且只有有效 3:4 可通过封面检查；未选 YouTube 时缺 16:9 不阻断。确认稿必须属于同作品同平台且唯一有效，标题/正文/图片只读；改稿先退回。模板未核验、账号不就绪仍阻断。

### 执行动作

- upload：{action,expectedRevision,requestId:UUID,platformIds,materials}。platformIds 非空无重复；只能包含无回执、已过期或可安全重传目标。服务事务核对版本和真实材料并冻结每平台输入，经浏览器逐个平台填写，支持草稿则保存草稿，否则停在最终发布按钮前；真实流程在第 13 章第 11 步核验。上传不获准点击发布。失败不阻断其他目标；结果未知先核对，不盲重传。
- publish-all：{action,expectedRevision,requestId:UUID,confirmed:true,materials,receipts:[{id,expectedRevision}]}。用户看可读取截图后确认一次，只提交当前 ready 的非空唯一回执清单。服务原子核对所属记录、版本、期限、材料、账号、模板和文件；受理前失效返回 409，不替换核对材料或增加目标。受理后逐平台再检查，单个失效不阻断其他目标。
- return：{action,snapshotId}。原子退回尚未执行/发布的确认稿，移除对应目标并使截图失效；执行中/结果未知禁止退回。
- 同一 requestId 返回原任务；记录/平台执行锁阻止不同请求重复点击。网络错误复用请求 ID；没有状态读回不得开启上传/发布。

### 平台截图和回执

每条发布记录每个平台只有一条当前回执，尝试历史另存。状态为 queued/uploading/ready/expired/submitting/pending_review/published/failed/unknown。回执含 revision、截图资产 ID、上传时间、该平台 materials、failureStage、safeToRetry、reason，以及真实作品 ID/链接/发布时间。

platformMaterialKey 只包含该平台使用的标题、简介、话题、时间、对应比例封面文件版本、成片、相关确认稿及图片、模板、账号状态。作品名、updatedAt、其他比例封面、其他平台设置/模板/账号及通用文案原字段不纳入。换 16:9 作废 YouTube，不作废抖音；真正改变抖音最终文案则作废抖音。整次操作 materials 是所选平台指纹的稳定集合。

ready 在上传完成满配置 publishUploadExpiryHours（默认 2 小时）时过期；时间非法/缺失/未来、截图缺失或材料变动同样失效。前端每 30 秒刷新并在操作时重检，服务时间权威。submitting/pending_review/published/unknown 不因旧截图过期开放重传。

重试发布仅允许 failed + failureStage=publish + safeToRetry，且原截图可读、未过期、材料相同。上传失败或材料/截图失效先重新上传。未知结果必须核对平台，不能因断网标安全失败。published 必须有真实平台证据。

## 互动收件箱与商单

评论/私信随每日主抓取读取，保留原文、发送者、作品、日期和真实原页链接。停用平台仍可看历史。私信按平台+会话以最近读取证据判断最后发言者；评论须核实回复范围。缺失或矛盾为待核对，不能猜“已回复”。AI 分类固定 {category:deal/idea/other,reason}，通过 Zod；pending/failed 为识别状态，不算 other。

商单按消息去重自动创建；主题保留 messageIds 追溯。

| 写接口 | 输入 → 返回 | 处理 |
|---|---|---|
| POST /api/inbox/:id/topic | {expectedRevision} → {item:InboxMessage} | 事务核对消息版本和 idea 分类，按消息 ID 幂等创建信号；不改回复状态 |
| PATCH /api/deals/:id | {brand,requirement,status,expectedRevision} → {item:Deal} | 核对版本，服务更新时间并清除旧建议；保留不可变来源 |
| POST /api/deals/:id/suggestion | {suggestionId,expectedRevision} → {item:Deal} | 核对建议、商单及最新会话证据版本，确认后清除建议；客户端不能指定目标状态 |

商单仅 pending/following/completed，名称和长度取配置，未知品牌/需求为 null。建议不自动改状态，核验商单和证据版本；过期、来源丢失或状态一致禁用。冲突保留输入。

待回复依消息证据，私信按平台/会话去重，评论逐条计，保留全部商单入口；业务完成不等于已回复。下次读取确认回复后移出待办。不提供平台回复、删除或强制抓取。
