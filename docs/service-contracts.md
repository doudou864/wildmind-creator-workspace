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

## 发布中心

`GET /api/publishing` → `PublishingData`（`src/lib/publishing-model.ts`），含作品、已保存成片、素材、不可变排版确认快照、批次、逐平台回执、账号可用性和月度观看时段推荐。所有记录来自真实服务；读取失败保留当前编辑。界面发现当前批次修订号或执行状态变化，立即阻止旧稿保存/提交，允许人工载入新版本。

- `POST /api/publishing/drafts`：PublishDraft → PublishBatch。视频 / 排版 / 小红书来源不可混用；客户端不提交服务端状态、修订号或确认稿正文。
- `PATCH /api/publishing/drafts/:id`：同上 + expectedRevision → PublishBatch。原子校验旧版本；已排队、执行中、已结束均不可再编辑或提交。服务检查关联作品和来源 ID，模板与账号状态以服务读取为准，旧版本409，不存在404。
- `POST /api/publishing/media`：multipart `metadata={kind:'video'|'xhs',contentId}` 与 `files` → `{videoId,assetIds}`。本次仅做结构、声明类型和尺寸上限校验后返回503，未写文件。接入时检查真实文件字节、解码、尺寸/时长/数量、关联实体；路径由服务生成并写入受控 data/，不得信任浏览器 MIME/扩展名；小红书素材 source=upload。视频与图片不能混批，返回已持久化资产 ID 后才算上传成功。
- `GET /api/publishing/media/:id/file`：由真实成片 ID 读取受控文件；后续需支持视频 Range。当前503，不泄露文件系统路径。
- `POST /api/publishing/drafts/:id/actions`：严格区分三种操作，均携带 expectedRevision。
  - `action:'ai', instruction`：只修改已保存批次的发布配置。排版确认稿的标题、正文、配图和封面不可改，视频/小红书可调整标题、文案、标签和时间。结果需 Zod 校验，再返回更新的 PublishBatch；异步实现必须补任务状态接口后才能启用。
  - `action:'return', snapshotId`：原子检查确认稿属于本批次、尚未排队/执行/发布；与排版中心联动退回并使旧快照失效，从当前批次移除对应目标。执行中、结果未知或已发布不能退回。
  - `action:'publish', requestId(UUID), confirmed:true`：用户核对本批次之后才发送。事务内校验 expectedRevision、draft 状态、关联来源、完整文件、确认稿仍有效、真实账号状态、模板已核验、标题/文案限制、时间仍在未来；服务重新执行内容检查，禁止客户端自报已检查。冻结所有平台文案/封面/时间及模板版本，记录确认与 requestId；重复相同 requestId 返回同一批次。页面只把成功响应视为“受理”，不能显示“全部已发布”。
- `POST /api/publishing/receipts/:id/retry`：`{expectedRevision,requestId,confirmed:true}`。只有 failed 且服务已在真实平台核实未发布（safeToRetry=true）的单条回执可重试；queued / submitting / pending_review / published / unknown 一律禁止。原子更新只重试此平台，不能重发其他成功项。连接中断后先核对平台，不能盲重试。

封面自动匹配同 contentId + purpose=video_cover + selected + 真实比例；同一比例存在多组已选封面时阻断，不能随机选第一张。三个比例均应齐备；每平台从模板映射比例，不让用户每次手选。确认稿只接收排版中心送入的不可变快照，同一作品同平台须唯一；快照引用明确资产版本，不能随素材库后来选版漂移。

时间统一 Asia/Shanghai；推荐只用本月观看时段，过期记录标记为过期。选平台时套用有效推荐/明确模板默认时间，今天已过则下次为明天同一时段；没有数据时保持“确认后立即发布”并显示无推荐，用户可手工定时。当前配置的标题/文案上限及默认时间为 null、verified=false，不将未知限制当作无限制并放行；接入时须核验平台规则及真实后台。

回执区分排队、发布中、平台审核中、已发布、失败、结果待核对。必须有真实平台证据才记录 published；审核中不冒充已发布。发布成功存平台作品 ID、实际时间、平台标题、链接并关联原作品，多个平台归同 contentId。默认时间与回执都不能填估计值。

实际平台操作须经 `src/browser/`，只在明确人工确认发布后执行；不用平台 API。当前 capability 全为 false，写接口全部503，未实施任何真实上传或发布，也未完成第13章第10步的持久化交付闭环。
