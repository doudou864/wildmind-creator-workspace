# 前端服务接入契约

本轮只做前端与接口边界。所有修改接口目前返回 503 `SERVICE_UNAVAILABLE`，不得以 200 空响应伪报成功。接入真实服务后才打开相应 capability；数据库和 AI 接入需单独实施。

## 读取

- `GET /api/dashboard` → `DashboardData`（src/lib/workspace-model.ts）。账号指标与作品指标仍按 PRD 长表存储，此 DTO 仅为视图聚合，不能据此将数据库改成宽表。
- `GET /api/topics` → `TopicData`（src/lib/topic-model.ts）。`d21Samples: null` 表示尚未核算，不能填 0；返回所有保留的候选/已选/已跳过/已发布记录，不能因渠道停用而删除。
- `GET /api/images` → `ImageData`（src/lib/image-model.ts）。选题/作品关联项只返回真实实体。资产通过 ID 取文件，不能让客户端提交任意文件系统路径。

首次渲染与刷新调用同一读取器 `src/lib/workspace-service.ts`。客户端失焦后重新聚焦会刷新；请求失败保留当前记录并显示错误，不清空旧数据。

## 单条选题更新

`PATCH /api/topics/:id`：`{status: 'candidate'|'selected'|'skipped', expectedRevision: number}`。严格拒绝客户端传入 frozenFire、证据或首次选中时间。

数据库接入时：在 SQLite 原子事务内读取该 ID、校验 expectedRevision、读取真实样本门槛，调用 `applyTopicDecision` 并只更新该 ID。旧版本返回 409 `CONFLICT`，不得覆盖；不存在返回 404；已发布不可退回。不同选题互不覆盖。`revision` 每次成功递增，返回更新后的 Topic。

第一次 selected 保存 FIRE 和证据快照（作品数、D21 倍数、走势及理由）；之后恢复、重选或数据变化均保留快照。客户端不做乐观成功更新，等待接口成功后刷新；冲突显示服务错误并刷新。旧演示 localStorage 绝不自动迁入业务库。

`POST /api/topics/generate`：服务每次重新读取渠道配置，只从启用渠道生成；20 候选、探索配额和 FIRE 门槛从参数读取。真实来源与探索热度必须核实。执行前不可由客户端自报样本数量。

## 总控台口径

Checkpoint 按 D1/D3/D7/D21 独立带 ratio/baseline/samples/capturedAt/status/provenance/reason。采集缺失、未到点、样本不足不能合并成零；补抓必须显示真实时间和标记。D1 不参与走势。倍数从复盘服务取得定格值；前端只展示与筛异常，不另算基线。

HitRatePeriod 由服务按平台、首发月份和 FIRE 分组聚合：抖音视频/图文合并；公众号独立；自动建立、历史补录排除。历史月份 phase=final 用 D21 已终判分母；当前月份 phase=estimated 用 D7 已完成分母。total 为该组本月首发选题数。零分母显示 --；结论门槛来自 parameters.conclusionMinimum（默认30）。未接入核算时不提供假的0%或结论。

## 生图与素材

- `POST /api/images/drafts`：ImageDraftInput → ImageDraft。保存时服务再次校验用途/风格/比例与关联实体。
- `PATCH /api/images/drafts/:id`：ImageDraftInput + expectedRevision → ImageDraft；旧版本409，保护用户未保存的编辑。
- `POST /api/images/generate`：ImageDraftInput → 已受理任务。parentAssetId 非空表示单图修改，必须保留原图和原比例，并生成同一 family 的新版本。改图必须有 editInstruction；初次生成视频封面三比例、公众号两比例；文章优先 existingAssets，只为缺图段落生成。服务端重新计算 outputs，不能相信客户端数量。
- `POST /api/images/assets`：multipart file + metadata（title、purposeId、topicId、contentId、prompt、parentAssetId、expectedRevision）。文件只能写到 data/ 下的服务端生成路径；按真实字节校验 MIME/尺寸，限额来自配置，拒绝伪装与损坏文件。用户图片不自动裁剪。新版本继承原 family、用途与比例，忽略伪造的 parent 元数据，事务内检查 familyRevision。
- `GET /api/images/assets/:id/file`：按资产 ID 读取本机受控图片，Content-Type 取校验后的 MIME。
- `POST /api/images/assets/:id/select`：`{expectedRevision}`。对 family 原子选版，旧版本409，同 family 最多一个 selected；更新并返回资产。禁止取消另一比例/另一 family 的选定项。所有版本保留。

生成草稿、文件入库和选版的成功分别记录，不能把“生成请求受理”当成“图片已生成”。真实生成服务接入时须补任务状态/结果刷新与失败重试，再将 generationReady 设为 true；当前页面不虚构进度。历史参考图排序由服务依配置执行，不让用户手选以代替该规则。发布操作不属于生图中心。

## 排版中心

- `GET /api/layouts` → `LayoutData`（`src/lib/layout-model.ts`）。返回真实稿件和可读取素材，三项能力分别为 storageReady / aiReady / handoffReady。未接入时全为 false。
- `POST /api/layouts` → `LayoutDocument`：提交 source 和三份 LayoutContent（title/blocks/covers）。结构化文本只允许正文、小标题、引用、列表、图片；ID 必须唯一。不接受客户端伪造 status、revision、confirmedRevision。
- `PATCH /api/layouts/:id` → `LayoutDocument`：同上 + expectedRevision。对整篇稿件进行原子并发校验；旧修订返回 409，不存在返回 404。服务比较每版内容，仅变更的版本递增 revision、清除确认；不能更改 sent 版本。未变动版本的确认必须保留。成功返回真实服务端修订号，不能使用客户端临时 revision。
- `POST /api/layouts/:id/actions`：`{platform, action: 'confirm'|'send'|'revise'|'ai', expectedRevision, instruction?}` → 更新后的 `LayoutDocument`。每次操作原子检查整稿修订号。
  - confirm：服务重新验证 `layoutIssues`、资产文件可读性及真实尺寸；只确认当前版本，保存 confirmedRevision=revision；已送出版本禁止确认。
  - send：只允许 status=confirmed 且 confirmedRevision=revision；创建包含标题、结构、明确资产版本与封面的不可变快照，同事务标记 sent。重复提交须幂等返回已有快照，不能重复创建发布任务。这一步不调用平台发布。
  - revise：与发布队列联动撤回待发快照并恢复 draft、撤销确认。已发布/执行中/结果未知返回冲突，不能把前端解锁当成成功撤回。
  - ai：必须有非空 instruction；只修改指定版本，保留其他两版。生成后再次校验结构及资产，变更使确认失效；不能修改 sent 版本。当前契约要求完成后返回稿件，若采用任务队列需先补任务状态读取与失败处理，不能直接启用 aiReady。

前端本地“开始排版”只按明确标记识别结构，三版从同一份原文初始化。抖音不伪造 AI 精简结果，由用户直接编辑；X 引用转正文、支持文本加粗，不执行输入 HTML。正文图通过资产 ID 插入，微信双封面与抖音比例按配置核对。图片 bytes/MIME、服务端受控路径和确认快照需后端再验证，不能仅依赖客户端的尺寸字段。图数默认 9 为工作台保守值，非已核实的抖音平台硬上限。

当前所有写操作仍返回 503；不安装或替代数据库依赖，不使用 localStorage 冒充保存。预览展示平台结构，真实平台导出、渲染一致性和第 13 章第 9 步的完整持久化闭环留待服务接入验收。

## 发布中心（PRD v1.8）

`GET /api/publishing` → `PublishingData`（`src/lib/publishing-model.ts`）。返回真实作品、成片、素材、排版确认快照、批次、逐平台回执、账号和本月时段推荐。增加独立能力 `uploadReady`；storageReady / aiReady / uploadReady / publishReady / handoffReady 当前全为 false。读取失败保留当前编辑，中文说明连接或响应错误。执行中前端轮询该读取接口；没有任务状态读回能力不得开启上传或发布。

### 批次与自动平台版本
- `PublishDraft.commonCopy={title,description,tags}` 是唯一通用文案来源，tags 存不带平台包裹符的词条。视频、小红书填一次；排版来源不显示通用编辑，标题/正文/封面保持确认快照只读，自动套话题和时间。
- `PublishSetting.individuallyEdited:boolean` 必填；只打开卡片不算修改。用户修改任何平台字段后置 true，之后修改通用文案不覆盖整个该平台设置。恢复为通用文案调用同一生成规则、重置标志及默认时间。AI 更新通用文案后也按此规则同步，不覆盖单独修改项。
- `config/publishing-templates.yaml` 增加 `tagFormat={prefix,suffix,separator}`，由确定性函数格式化话题，平台适配器消费格式化结果，不能对已经格式化的词重复加符号。当前格式是待核验的工作台默认值，verified=false 继续阻断，不能称为真实平台规则。标题/简介保留全文，用 Unicode 字符计数检查上限，超限提示且阻断上传，绝不自动硬截断。接入 AI 后可以改写，仍须检查上限。
- 时间用有效本月推荐，其次模板默认，今天已过则明天同一时段；无数据为 null（最终确认后立即发布），不伪造推荐。时区统一 Asia/Shanghai。
- `POST /api/publishing/drafts`：PublishDraft → PublishBatch。`PATCH /api/publishing/drafts/:id`：PublishDraft + expectedRevision → PublishBatch。来源不可混用；服务不接受客户端状态、修订号或确认稿正文。批次 draft/prepared 可以编辑，uploading/queued/running/finished 不可编辑；修改使有关平台旧截图失效。旧版本409，不存在404，不符合业务422。当前有效请求503，非法请求400。
- PublishBatch.state 新增 uploading / prepared；有待审核、可重传或可安全重试目标时保持 prepared，仅所有平台已到稳定终态才 finished。批次返回更新修订号；不得用批次状态代替单个平台的回执证据。

### 本机素材与平台上传是两项操作
- `POST /api/publishing/media`：multipart `metadata={kind:'video'|'xhs',contentId}` + files → `{videoId,assetIds}`。这是素材存储，尚未接入，校验后503。真实接入再校验文件字节、解码、尺寸/时长/数量和关联实体，由服务生成受控路径，小红书图片必须 source=upload。
- `GET /api/publishing/media/:id/file`：读取受控成片，接入时支持 Range；当前503。图片和后台截图统一用资产 ID 走 `/api/images/assets/:id/file`，不可接受任意文件路径。后台截图是独立且不可变的审核资产，不冒充用户封面。
- 视频封面只取 Content.videoCovers 明确采用的资产 ID，核验同作品、video_cover 用途和真实尺寸；三比例完整，每个平台按模板映射。素材库 selected 不影响作品采用。确认稿同作品同平台须唯一、有效且图片存在，发布中心不改写正文。

### 两阶段操作
统一 `POST /api/publishing/drafts/:id/actions`，严格 discriminated union；新增 upload 与 publish-all，旧 publish 动作拒绝400。所有写操作当前合法请求503，不产生任务/回执、不操作平台。

1. **上传到各平台**：`{action:'upload',expectedRevision,requestId:UUID,platformIds:string[],materials:string}` → PublishBatch（已受理而非已上传）。platformIds 非空无重复；必须属于此批次。第一次只提交无回执目标；再次只能提交 expired 或 failed 且 safeToRetry 的上传失败/材料失效/截图过期目标。不重复触发 uploading/queued/submitting/pending_review/published/unknown，也不重传已有效 ready 目标。前端对相同批次版本、材料与目标复用 requestId，网络错误不盲目换 ID。
   - 服务事务内核对修订和真实来源、文件、模板、账号、字数、时间及 materials；幂等后冻结每平台实际材料，经 `src/browser/` 逐个平台填写。有草稿功能优先存草稿，否则停在最终发布按钮前。草稿能力和确切流程在第 13 章第 11 步用真实页面确认。此动作获准上传/保存草稿，绝不获准点击发布。
   - 每平台回传独立状态与填好页面的真实截图资产 ID；失败记录原因，不影响其他目标继续上传。无法判定写入结果时 unknown，核实前不可重传。
2. **全部发布**：`{action:'publish-all',expectedRevision,requestId:UUID,confirmed:true,materials:string,receipts:[{id,expectedRevision}]}` → PublishBatch。用户查看可读取的截图后确认一次，客户端只提交当前就绪平台；非空、ID 不重复。服务原子核对这些回执确属本批次、唯一对应平台、当前 ready、版本及截图、期限、材料仍一致，并重新核验账号/模板/文件/定时。事务受理前任何选中回执失效返回409，不能悄悄替换截图或增加新目标。
   - 接受后只逐个执行这份冻结清单，每次点击前再检查期限/材料。某平台此时失效则单独失败或过期，其他平台继续。最终点击必须经 `src/browser/`，不用平台 API。重复 requestId 返回原任务；同一批次/平台执行锁阻止不同请求重复点击。
3. `action:'ai',expectedRevision,instruction`：只生成视频/小红书通用文案，经 Zod 校验，沿用单独修改保护；排版内容不改写。返回更新批次，异步任务需另补状态读取协议。`action:'return',expectedRevision,snapshotId`：原子退回有效、尚未执行/发布的确认稿并移除对应目标、使截图失效；执行中/结果未知禁止退回。

### 回执、过期和失败重试
- PublishReceipt.status：queued / uploading（上传中）/ ready（已就绪待发布）/ expired（已过期，需重新上传）/ submitting / pending_review / published / failed / unknown。
- 新字段：`screenshotAssetId:string|null`、`uploadedAt:string|null`（ISO 带时区，上传完成时刻）、`materials:string|null`（该平台实际材料版本）、`failureStage:'upload'|'publish'|null`。保留 reason、safeToRetry、revision 及真实平台作品 ID/链接/发布时间。一个批次每个平台只返回一条当前回执，尝试历史由服务另行保留，不让旧 ready 参与发布。
- `config/parameters.yaml:publishUploadExpiryHours=2`。ready 在上传完成满该时长时失效；非法/缺失/未来时间、缺截图或材料改变同样不准发布。前端30秒刷新时钟，操作瞬间再次检查；服务使用服务时间作权威判断。发布中/审核中/已发布不因原截图超过2小时退回可重传状态。
- `platformMaterialKey` 包含本平台设置、作品/视频/封面版本、相关确认快照、模板和账号条件。通用来源文字及其他平台设置不纳入；单独修改的平台不因别的平台文案变化被覆盖或失效。整批 materials 仍在上传/全部发布时由服务重算比较。客户端指纹仅用于并发核对，绝不是授权凭据；服务必须重算且读取真实文件。
- 截图读取失败禁止前端确认；截图资产ID不可覆写复用。只要材料改变，不能继续信任同一旧截图。
- `POST /api/publishing/receipts/:id/retry`：`{expectedRevision,requestId,confirmed:true,materials}`。仅 failed、failureStage=publish、服务已核实未发布（safeToRetry）、原截图可读/未过期且材料一致允许重试发布。过期、材料改变或上传失败必须先单独重新上传。提交前核验选中平台内容/账号/模板/时间。其他平台成功、审核中、结果不明都不重发。
- 未知结果必须先核对平台，不能因为客户端连接中断标为安全失败；记录真实结果后才开启重试。失败一个平台不阻断其他 ready 平台发布。published 必须有真实平台证据，记录平台作品 ID、实际时间、平台标题、链接并关联原 Content。

当前只有前端、校验函数与接口契约，无真实平台上传/发布、AI 或数据库实现。第13章第1步将另行推进，不能把本次前端验收称为数据底座完成。

## 互动收件箱

- `GET /api/inbox`：InboxData。只读取本机已存记录，不运行平台抓取。`recordsReady=false` 时统计显示 `--`，不解释成真实零条。`sources` 按平台和评论/私信记录读取状态、实际读取时间与失败原因。正常运行当前返回空数组与关闭的能力，不注入样例。
- `items` 一条对应一条接收到的评论/私信；我方发言只进入上下文。消息 ID 跨平台全局唯一；私信另有 conversationId。保留原文、发送者、平台、作品关联、时间和真实原页 URL，不能编造缺失字段。停用平台的历史消息仍可读取。
- 评论与私信随每日主抓取读取一次。回复判定由平台证据更新：私信最新一条的发送者为对方才待回复；评论识别到我方回复就算已回复。完整回复范围内未发现我方回复的评论才算待回复。缺失、未核实或矛盾证据均为待核对，不猜测状态。
- 私信消息按平台+会话归组，统一采用该组最近一次读取的证据；同一读取时刻结论冲突则待核对。旧消息不能覆盖较新会话回复。待回复按会话/评论去重，筛选后的消息条数与待回复数量可以不同。总控台接入时应采用相同口径；回复后在下次读取移出待回复行动，原消息保留。
- AI 输出固定 `{category: deal|idea|other, reason: string}`，必须用 `inboxClassificationSchema` 校验；分类之外的路由和重试由代码决定。pending/failed 是识别状态，不是额外业务分类，不归入 other。
- 商单分类由服务自动创建/关联 Deal 并进入总控台今日行动；按来源消息去重创建，记录 dealId、dealSync 和失败原因。前端只展示自动流转状态，不提供手工创建或重试按钮。商单页面通过 `/deals` 查看本机记录，当前服务仍未接入。
- 问题/观点的需求主题由服务汇总，保留 messageIds 供追溯；主题聚合应避免重复计入同一消息。前端展示真实返回的主题及当前平台/类型范围内的来源，缺失来源明确提示，不用关键词临时伪造主题。
- `POST /api/inbox/:id/topic`：严格输入 `{expectedRevision}`。服务在事务内读取消息、核对 revision（过期409）、确保分类为 idea，按源消息 ID 唯一创建 TopicSignal；已有关联返回原有 signalId，不重复创建。保留原文、发送者、平台、作品和抓取日期，返回 `{item: InboxMessage}`，含确认后的 topicSignalId/topicSyncedAt/revision。来源不存在404，不符合分类422。当前合法请求503、无版本或夹带分类/回复状态400。
- 同步选题不改回复状态，不写平台。前端只在成功回执含同一消息 ID 与 signalId 时显示同步完成；失败保留原消息，已确认回执在本页防止重复点击，数据库仍须提供幂等保障。服务未接入时按钮禁用。
- 不提供平台回复、删除、手工标已回复、强制读取或自动回复接口。打开原平台链接只是查看入口；本前端不自动在平台操作。

以上是前端与接入契约；实际消息采集、AI 分类、需求主题聚合、SQLite 原子事务、商单及今日行动联动仍未接入，不代表第13章第6步业务闭环完成。

## 商单列表

- `GET /api/deals`：DealData（items、messages、recordsReady、writeReady、suggestionReady、message）。读取本机商单与关联消息/同会话最新证据；不触发平台抓取。当前返回空记录和关闭能力。消息 ID 与 `/api/inbox` 使用同一稳定标识，便于 `/deals?deal=...` 与 `/inbox?message=...` 互相定位。消息缺失时不填补原文。
- Deal 只有 pending（待处理）、following（跟进中）、completed（已完成）三档，从 `config/deals.yaml` 取显示名称；没有新增成交、丢单或拒绝等状态。品牌/需求尚未核实允许 null；不可填假值。源消息、平台、评论/私信类型、创建时间保持不可变。源消息自动建立线索并按来源去重，前端没有重复新建入口。
- `PATCH /api/deals/:id`：严格输入 `{brand: string|null, requirement: string|null, status, expectedRevision}`，字段长度取配置。服务在单条事务中核对版本后调用 `applyDealEdit`；旧版本409，不存在404，合法更新递增修订并由服务记录 updatedAt，清除旧建议。无实质变化可返回原记录。用户可在三档间纠正进度，不设置不可逆终态。回复证据与其他商单不变。
- 保存成功返回 `{item: Deal}`。前端验证同一 ID、更新修订、相同来源/创建时间和请求字段一致才确认成功；接口失败或冲突保留弹窗输入，冲突禁止继续覆盖，用户明确放弃编辑后才载入最新记录。关闭或 Escape 遇到未保存编辑先提示；浏览器重载也有未保存提醒。当前合法请求503、非法字段或夹带来源/时间/回复状态400。
- 可选 AI 状态建议保存 `{id,status,reason,expectedRevision,evidenceMessageId,evidenceRevision}`，用 `dealSuggestionSchema` 校验。仅使用同平台同私信会话的真实消息作为证据，不自动更新商单。前端显示建议理由、原文和时间；商单版本、证据版本过期、已有更晚会话读取、来源丢失或目标已是当前状态时禁用确认。
- `POST /api/deals/:id/suggestion`：严格输入 `{suggestionId,expectedRevision}`，客户端不能自选或替换建议目标状态。服务事务内核对建议、商单和最新会话证据（以实际会话读取版本为准），调用 `acceptDealSuggestion` 后返回 `{item: Deal}`。过期建议409，不存在404，不符合建议条件422。确认成功清除建议，重复确认不得重复执行。当前合法请求503，缺版本或夹带状态400。
- 总控台三档计数读取同一 `/api/deals`，未接入显示 `--`；按状态跳转商单列表。待回复商单行动采用收件箱相同的会话/评论证据，不以“跟进中/已完成”冒充平台已回复；新消息使已完成合作再次待回复时，保留商单进度并展示沟通待办。等待时长标为“读取时已等”，不伪装成实时监控。平台回复后在下次读取移出行动。
- 新线索进入今日行动的完整链路仍依赖后端自动识别、创建与消息读取；当前页面仅消费真实服务结果或展示未接入空态，不演示自动入库成功。不会新增平台回复、删除消息、合同、预算、回款或强制抓取操作。

数据库持久化、线索生成和 AI 建议生成尚未接入；上述事务、幂等和平台证据核验为后端接入要求，不代表已有运行中的数据库实现。

## 2026-10-17 全站审查修订（以下条款替代前文冲突约定）

### 作品关联
- `GET /api/contents` → `ContentData`。每条作品包含 id、revision、title、topicId、form（视频 / 图文）、plannedDate（有效的北京时间日历日期或 null）、videoCovers（比例 → 明确资产版本 ID）。选题与作品是一对多关系，不从同名标题猜测身份。
- `POST /api/contents`：`{title,topicId,form,plannedDate}` → 持久化后的完整 Content。服务核对选题是否存在。一个选题可多次新建不同作品，不将重复 topicId 当作唯一键。
- 创建入口复用于选题、生图、排版和发布；不可用时禁用。前端收到同 ID、真实字段的回执后才确认创建，接口失败保留填写内容。
- LayoutDocument 和保存请求增加 contentId（未关联的本地编辑可为 null，但界面保存/确认前须关联图文作品）。服务禁止将已保存排版稿改挂其他作品，send 创建的快照继承该 contentId。所有版本归同一作品；可从稿件进入 `/publishing?content=...&kind=layout`，发布记录可回到 `/layouts?layout=...&content=...`。
- ImageData、LayoutData、PublishingData 中的作品列表使用同一 Content 定义与稳定 ID。生图选择作品时同步其 topicId，已有作品关联后不允许另选冲突选题。服务仍须核验关联一致性和内容形式。

### 素材来源、用途与作品采用
- 上传是文件来源与操作入口；请求中的 purposeId 必须为实际用途，不能再把 upload 当作新资产用途。旧 upload 资产可以编辑用途与关联，也可以作为单图修改原图。保留 source=upload，不允许改成 AI。
- ImageDraft 增加 uploadPurposeId，保存文字不代表保存本地预览文件。自由用途上传允许实际比例，视频/公众号等固定比例用途检查真实尺寸；服务接入时再次解码核验。
- `PATCH /api/images/assets/:id`：`{title,purposeId,topicId,contentId,expectedRevision}` → 更新后的 Asset。expectedRevision 是 familyRevision。更改家族元数据需原子更新相关版本，不能改变文件、原来源或已确认快照；被作品采用或确认稿引用而会破坏引用时返回 409，要求先解除采用/退回稿件。
- `POST /api/contents/:id/covers`：`{ratio,assetId:string|null,expectedRevision}` → 更新后的 Content。expectedRevision 是作品 revision；assetId=null 表示解除该比例采用。选择另一组的版本会原子替换该作品/比例的采用关系，其他图片组的默认 selected 不改变。
- 采用前核验资产属于本作品、用途 video_cover、真实比例和文件可读。Content.videoCovers 是发布采用的唯一来源，不再按全库 selected 自动猜封面；未指定或失效时阻断。family 内部 selected 仅为素材选择默认，不能自动替换已采用版本。
- 生图用途配置增加 reuseAnyRatio；普通文章插图可保留任意比例，抖音图文配图必须满足配置比例。两端按真实尺寸核验。

### 编辑保护与发布确认
- 未保存编辑仅在当前浏览器文档内存中保留，供站内前进/后退后恢复，不写 localStorage、不表示保存到业务库。刷新/关闭窗口仍提醒；明确放弃或保存后清除相应临时会话。本地预览 File 和对象 URL 在未保存会话恢复时继续可用。
- 生图保存只确认请求发出时的编辑版本。请求未结束时的新增编辑继续标记未保存；本地预览文件需独立上传，不能因为文字保存而取消提醒。
- 发布核对时记录 materials（确定性序列化的草稿、作品修订、明确封面/配图版本、视频、确认快照、模板与账号条件）。条件变化后当前勾选失效，需要重新打开核对清单。
- v1.8 的 upload / publish-all 动作必填 materials；后端事务内根据真实状态重算并比较，不能相信客户端任意传来的内容。不同则返回 409，禁止用最新封面替换用户核对过的封面。匹配成功才冻结执行快照。前端指纹不是服务端授权凭据。

### 总控台完整待办
- DashboardData 增加 questions / questionsReady（未同步的有价值问题）、plannedContents / plansReady（仍待发布的作品计划）、themes / themesReady / themeSyncReady、accountAlerts / accountAlertsReady。各来源未就绪时显示未知，不冒充零待办；仅所有来源完整且无记录时显示今天没有待办。
- 总控台按今日计划日期筛作品，视频进入视频发布，图文进入排版确认稿分发。计划记录由服务与真实发布状态联动，已完成计划不得继续返回为待发布。
- themes 返回 `{id,revision,title,count,signalId}`；来源在 `/inbox?theme=...` 追溯。`POST /api/dashboard/themes/:id/topic` 输入 `{expectedRevision}`，返回 `{themeId,signalId}`，按主题稳定 ID 幂等，服务核对真实消息来源并创建 TopicSignal，不生成假候选、不修改回复状态。
- accountAlerts 包含账号违规、限流或粉丝下降的真实证据时间、原因与可选原页链接，不由前端猜测异常。
- 同平台同私信会话仅一个沟通待办，组内保留全部商单入口；评论逐条计数。商单业务状态仍独立于回复证据。不得因为商单数量多而重复计同一会话等待。
- 小红书与视频号的内容形式配置包含视频和图文，生产与复盘共用此配置。

以上新写接口与现有能力一样，未接入时合法请求返回 503，非法请求返回 400。没有新增数据库、真实上传、采集、AI 或平台发布能力。
