# U1 移出的界面说明

下列原说明按页面归档（保留动态表达式以说明取值来源）。这是开发与操作参考，不再直接占用正常页面。实际错误、数据来源、发布确认条件仍保留在对应操作中。

## src/app/dashboard.tsx

```tsx
<p className="muted">采集服务尚未接入，当前无法执行重抓。</p>
```

```tsx
<p className="muted">各检查点分别计算并定格；D1 只用于异常提醒，不参与走势分类。</p>
```

```tsx
<p className="small">
                {!workspace.accountAlertsReady ? '账号违规 / 限流信息尚未接入。' : '部分待办资料尚未齐备。'}
              </p>
```

```tsx
<div className="insight-footnote small">
              仅在 D1 / D3 检查点识别异常；
              <br />
              样本不足或指标缺失时不做判断。
            </div>
```

```tsx
<div className="works-footnote small">
              <span>视频与图文分别计算基线 · 不足 {parameters.baselineMinimum} 条时不算倍数</span>
              <span className="mono">{platform.code}</span>
            </div>
```

```tsx
<footer className="footer">
        <span className="mono">WILDMIND / CREATOR WORKSPACE</span>
        <span>
          只和自己的历史作品比<span className="footer-divider">/</span>本机工作台
        </span>
      </footer>
```

## src/app/topics/topics-page.tsx

```tsx
<div className="topic-summary-note">
          <span className="eyebrow">PREFERENCE → DIRECTION</span>
          <p>
            偏好决定推什么
            <br />
            表现决定标什么
          </p>
        </div>
```

```tsx
<p className="small">
                外部渠道 {channels.filter((c) => c.kind === 'external').length} 个 · 在渠道文档中增删
              </p>
```

```tsx
<p className="small">有 D21 结果的抖音作品，含历史补录</p>
```

```tsx
<p className="small topic-rule">样本不足仍可选题，不新增 FIRE。首次选中的标记与依据永久保留。</p>
```

```tsx
<p className="small topic-rule">选中后可进入生图中心，关联封面与配图。</p>
```

```tsx
<footer className="footer">
        <span className="mono">WILDMIND / TOPIC DISCOVERY</span>
        <span>选题与表现分开判断 · 首次选择保留依据</span>
      </footer>
```

## src/app/images/images-page.tsx

```tsx
<p className="small topic-rule">{purpose.description}</p>
```

```tsx
<span className="small">
                    {purpose.id === 'douyin_images'
                      ? '使用同一份内容重新配竖图，不另写一篇文章。'
                      : '每段可先选已有图片，再为缺图的段落生成。'}
                  </span>
```

```tsx
<span className="small">{config.styles.find((s) => s.id === draft.styleId)?.prompt}</span>
```

```tsx
<p className="small">
                {!data.generationReady
                  ? '生图服务待接入，暂不能生成。'
                  : !data.storageReady
                    ? '素材存储服务待接入。'
                    : '结果会作为新版本保存，不覆盖原图。'}
              </p>
```

```tsx
<p className="small topic-rule">历史封面表现尚未接入，当前没有自动参考图。</p>
```

```tsx
<p className="small">
                      {data.storageReady ? '上传后可关联作品、选择版本。' : '存储服务待接入，当前仅预览本地图片。'}
                    </p>
```

```tsx
<p className="image-workarea-foot small">
                    当前展示输出安排。生成结果会保留各自比例与版本，选定后供排版中心和发布中心使用。
                  </p>
```

```tsx
<span className="small">每次修改生成新版本，保留原图。</span>
```

```tsx
<p className="small">改图服务待接入，修改要求尚未提交。</p>
```

```tsx
<p className="small">关联作品后，选定即为作品采用；未关联时只设置素材库默认版本。</p>
```

```tsx
<p className="small">生图中心只出图和存图，发布前仍需人工确认。</p>
```

```tsx
<footer className="footer">
        <span className="mono">WILDMIND / IMAGE STUDIO</span>
        <span>{data.storageReady ? '编辑内容自动保存' : '存储服务未接入，当前编辑仅在本窗口保留'}</span>
      </footer>
```

```tsx
<p className="small">
              来源始终保留为 AI 或用户上传。已被确认稿或作品采用的素材，服务会校验引用后再允许修改。
            </p>
```

```tsx
<p className="small">{data.storageReady ? '修改自动保存' : '素材存储服务未接入'}</p>
```

## src/app/layouts/layouts-page.tsx

```tsx
<span className="small">建立稿件后自动保存；服务未接入时仅保留本页编辑</span>
```

```tsx
<p className="small">初始内容来自同一篇文章；后续编辑互不联动。需要另一篇文章时选择“新建文章”。</p>
```

```tsx
<p className="layout-version-note">
                      原文已复用，请精简为图文文案。配图 {config.douyinImageRatio}，最多 {config.douyinMaxImages}{' '}
                      张（工作台配置）。
                    </p>
```

```tsx
<p className="layout-version-note">仅保留标题、加粗、列表、图片；引用转为正文。</p>
```

```tsx
<span className="small">
                      {!data.aiReady ? 'AI 修改服务待接入' : !persisted ? '正在自动保存稿件' : '修改后需重新确认'}
                    </span>
```

## src/app/publishing/publishing-page.tsx

```tsx
<p className="small">这里只接收排版中心送来的确认快照，正文、封面和插图均不可编辑。</p>
```

```tsx
<p className="small">仅使用自己制作并上传的图片，不从 AI 生图中自动选图。</p>
```

```tsx
<p className="small">
                    {!data.storageReady
                      ? '上传服务待接入；本机文件仅在本页预览。'
                      : '选择文件后自动上传保存，编辑内容也会自动保存。'}
                  </p>
```

```tsx
<p className="small publish-card-note">只检查所选平台需要的封面；在生图中心选定即采用。</p>
```

```tsx
<p className="small">填写一次，自动同步到未单独修改的平台；超长会标出，不会截断原文。</p>
```

```tsx
<span className="small">
                    {!data.aiReady ? 'AI 服务未接入' : '直接根据当前填写内容生成，保留已单独修改的平台版本'}
                  </span>
```

```tsx
<p className="small">
              勾选即生成平台版本。正常卡片默认收起，问题卡片自动展开；时间优先使用本月推荐，其次模板默认。
            </p>
```

```tsx
<p className="small">正文与图片来自确认快照，需要改内容请退回排版中心。</p>
```

```tsx
<p className="small">
                          {defaultPublishTime(item.platformId, data, config, now)
                            ? '已按本月推荐或模板时间生成，可单独调整。'
                            : '暂无有效推荐或模板时间；默认人工确认后立即发布。'}
                        </p>
```

```tsx
<p className="small publish-card-note">
              {!data.uploadReady
                ? '平台上传服务未接入；不会上传或点击发布。'
                : !saved
                  ? '内容正在自动保存；完成后即可上传。'
                  : '上传后逐个平台查看截图，再确认发布。'}
            </p>
```

```tsx
<p className="small publish-card-note">上传只填好后台并停在发布前；支持草稿的平台优先存草稿。</p>
```

```tsx
<p className="small">逐个平台查看填好后的真实截图。上传完成满 {expiryHours} 小时未发布，须重新上传。</p>
```

```tsx
<footer className="layout-foot">
        <span>平台审核中不等于已发布；失败只处理对应平台。</span>
        <span>通用文案 → 平台版本 → 上传 → 截图审核 → 全部发布</span>
      </footer>
```

## src/app/inbox/inbox-page.tsx

```tsx
<p className="small inbox-source-note">
          随每日主抓取读取一次。刷新仅重新加载本机记录，不触发额外抓取；平台回复后，待回复状态随下次读取更新。
        </p>
```

```tsx
<p className="small inbox-note">待识别与识别失败的消息仍保留在“全部消息”，不会自动归入“其他”。</p>
```

```tsx
<p className="small inbox-note">主题保留原消息来源，可逐条核对后同步到选题中心。</p>
```

```tsx
<span className="small">同步服务待接入，此操作暂不可用。</span>
```

```tsx
<footer className="layout-foot">
        <span>一条消息可贡献选题；同一私信会话只计一次待回复。</span>
        <span>读取 → 分类 → 商单 / 需求主题 / 选题输入</span>
      </footer>
```

## src/app/deals/deals-page.tsx

```tsx
<p className="small deal-summary-note">
        数量随平台与来源类型变化，包含历史商单。商单进度与消息是否已回复分别记录。
      </p>
```

```tsx
<p className="small deal-list-note">线索从互动消息自动进入，不在这里重复创建；原始消息始终保留。</p>
```

```tsx
<span className="small">
                    {data.writeReady ? '品牌、需求和进度可修改' : '保存服务待接入，暂不能修改'}
                  </span>
```

```tsx
<p className="small deal-list-note">
                  更改商单进度不会标记消息已回复。请在平台沟通，回复状态随下次读取更新。
                </p>
```

```tsx
<span className="small">建议确认服务待接入，此操作暂不可用。</span>
```

```tsx
<p className="small deal-list-note">根据新私信往来提供建议，由你确认后才更新商单；不会自动发送消息。</p>
```

```tsx
<footer className="layout-foot">
        <span>评论 / 私信 → 合作线索 → 人工跟进</span>
        <span>创建与更新时间由服务记录 · 历史商单持续保留</span>
      </footer>
```

## src/app/data-center/data-center-page.tsx

```tsx
<p className="small">
              缺数断线，不补零。
              {data.curve.some((r) => r.count < data.minimum) &&
                `部分天龄样本不足（最多 ${Math.max(...data.curve.map((r) => r.count))}/${data.minimum}），不足的天龄不画中位线和范围。`}
              悬停看当天样本数。
            </p>
```

```tsx
<p className="small">
              互动量按每千次播放比较；浅灰带是正常范围，黑色细针是本条位置。检查点补抓照常比较并标注。
            </p>
```

## src/ui/hit-rates.tsx

```tsx
<p className="small topic-rule">
        {!data.reviewReady
          ? '复盘服务待接入，暂无核算结果。'
          : !final && !estimated
            ? '所选月份暂无核算记录。'
            : !final?.conclusionAllowed || !estimated?.conclusionAllowed
              ? `样本未达到结论要求的月份只记录结果，累计 ${config.parameters.conclusionMinimum} 个选题前不判断推荐效果。`
              : '样本已达到结论门槛。'}{' '}
        按选题首发计数，排除自动建立及历史补录；抖音视频与图文合并核算，公众号单独核算。
      </p>
```

## src/ui/content-picker.tsx

```tsx
<p className="small">作品服务待接入；新建和保存暂不可用。</p>
```

```tsx
<p className="small">同一个选题可以分别制作视频或图文，每条作品独立关联素材和发布记录。</p>
```

## 改前默认页面的说明采样

以下是改前浏览器保存的原文，含动态服务状态与运行说明；记录本身及数值变化不计入删除说明的数量。

### dashboard

- LOCAL本机业务数据 · 每日更新刷新数据 ↻
- 账号违规 / 限流信息尚未接入。
- 命中 -- / 已终判 --该月首发选题 --
- 命中 -- / 已终判 --该月首发选题 --
- 预估命中 -- / 已完成 D7 --该月首发选题 --
- 预估命中 -- / 已完成 D7 --该月首发选题 --
- 所选月份暂无核算记录。 按选题首发计数，排除自动建立及历史补录；抖音视频与图文合并核算，公众号单独核算。
- 所选 30 天中仅有 2 天记录，区间净增暂不计算。
- WILDMIND / CREATOR WORKSPACE只和自己的历史作品比/本机工作台

### data-center

- ANALYSIS抖音 · 只和较早发布的同形式作品比刷新已存数据 ↻
- 缺数断线，不补零。部分天龄样本不足（最多 1/5），不足的天龄不画中位线和范围。悬停看当天样本数。
- 互动量按每千次播放比较；浅灰带是正常范围，黑色细针是本条位置。检查点补抓照常比较并标注。

### topics

- LOCAL使用已采集的启用渠道；收件箱仅使用主动同步的线索。搜索占比代表本账号需求，不代表全网热度。刷新记录 ↻
- 按启用渠道生成
- PREFERENCE → DIRECTION偏好决定推什么表现决定标什么
- 每批 20 个候选，含 2–3 个探索位；热度证据范围见具体来源。
- 外部渠道 0 个 · 在渠道文档中增删
- 有 D21 结果的抖音作品，含历史补录
- 样本不足仍可选题，不新增 FIRE。首次选中的标记与依据永久保留。
- 抖音搜索关键词 · 采集于2026-10-17T12:15:12.432Z；本账号显示占比：8.9%；原始线索未提供可直达链接；探索依据：给定已发布偏好未见益智题逐步验证，区别于自动剪辑和AI创业话题；已有华容道搜索线索支持尝试。history为空，未做过状态仍待核对；热度未验证。
- 样本尚未达到门槛，不新增 FIRE。
- 选中后可进入生图中心，关联封面与配图。
- WILDMIND / TOPIC DISCOVERY选题与表现分开判断 · 首次选择保留依据

### images

- LOCAL使用本机ChatGPT套餐；今天已用0/30次，一次只生成一张。刷新素材 ↻
- 新建图片任务
- 选用途，填写内容与要求，再生成、修改或选定素材。
- 一次准备三种比例，分别用于各平台封面。
- 结果会作为新版本保存，不覆盖原图。
- 历史封面表现尚未接入，当前没有自动参考图。
- 当前展示输出安排。生成结果会保留各自比例与版本，选定后供排版中心和发布中心使用。
- 生图中心只出图和存图，发布前仍需人工确认。
- WILDMIND / IMAGE STUDIO编辑内容自动保存
- 后台刷新验收 · 绿色茶杯 · 已完成并进入素材库
- 2026/10/18 02:11:06 · 生成 · 1 次 · 37秒 · 成功
- 2026/10/18 02:06:46 · 生成 · 1 次 · 47秒 · 成功
- 2026/10/18 02:05:47 · 生成 · 1 次 · 58秒 · 成功
- 2026/10/18 02:05:05 · 生成 · 1 次 · 43秒 · 成功
- 2026/10/18 00:07:51 · 生成 · 1 次 · 38秒 · 成功
- 2026/10/18 00:01:22 · 生成 · 1 次 · 102秒 · 成功
- 2026/10/18 00:00:15 · 生成 · 1 次 · 51秒 · 成功
- 2026/10/17 23:56:45 · 修改 · 1 次 · 164秒 · 成功
- 2026/10/17 23:54:49 · 生成 · 1 次 · 61秒 · 成功

### layouts

- 04 · LAYOUT STUDIO三个版本独立编辑；每次确认保存快照，送入发布准备。
- 一份文章，三个版本。分别编辑，分别确认。
- 尚未开始
- 预览按平台结构呈现，平台端最终效果在发布接入时核对。编辑自动保存 → 确认并送去发布去生图中心准备配图 →

### publishing

- 05 · PUBLISHING DESK审查 E 已通过。当前等待可真实发布的新作品，平台上传尚未完成实测；材料可继续准备，每个平台首次真实发布前仍须审查 F 确认。
- 文案只写一次。先上传看截图，再一次确认发布。
- 新建发布准备
- 选择文件后自动上传保存，编辑内容也会自动保存。
- 只检查所选平台需要的封面；在生图中心选定即采用。
- 填写一次，自动同步到未单独修改的平台；超长会标出，不会截断原文。
- 勾选即生成平台版本。正常卡片默认收起，问题卡片自动展开；时间优先使用本月推荐，其次模板默认。
- 平台上传服务未接入；不会上传或点击发布。
- 上传只填好后台并停在发布前；支持草稿的平台优先存草稿。
- 逐个平台查看填好后的真实截图。上传完成满 2 小时未发布，须重新上传。
- 平台审核中不等于已发布；失败只处理对应平台。通用文案 → 平台版本 → 上传 → 截图审核 → 全部发布

### inbox

- 06 · INTERACTION INBOX只读汇总；没有确认完整的回复记录会显示未知，不会假定待回复。
- 从评论与私信里，看见合作机会和真实问题。
- 平台只读 · 不自动回复
- 随每日主抓取读取一次。刷新仅重新加载本机记录，不触发额外抓取；平台回复后，待回复状态随下次读取更新。
- 待识别与识别失败的消息仍保留在“全部消息”，不会自动归入“其他”。
- 主题保留原消息来源，可逐条核对后同步到选题中心。
- 一条消息可贡献选题；同一私信会话只计一次待回复。读取 → 分类 → 商单 / 需求主题 / 选题输入

### deals

- 07 · BRAND COLLABORATIONS商单来自已识别的真实消息；状态由你确认，不自动回复。
- 从合作线索，到跟进完成。每条商单都有来源。
- 数量随平台与来源类型变化，包含历史商单。商单进度与消息是否已回复分别记录。
- 线索从互动消息自动进入，不在这里重复创建；原始消息始终保留。
- 根据新私信往来提供建议，由你确认后才更新商单；不会自动发送消息。
- 评论 / 私信 → 合作线索 → 人工跟进创建与更新时间由服务记录 · 历史商单持续保留

## 其他移出的说明与保留位置

- 总控台：行动卡的计数说明（按会话汇总、具体求助 / 高互动评论、回复记录不完整）及“查看原因与处理提示”。既有计数函数没有改变；规则仍见 PRD 与 inbox-model/deal-model。
- 排版：按文字标记识别结构；普通文本按段落排版，可在每版中调整；公众号保留完整排版，抖音复用原文，X 保留标题、加粗、列表和图片。配置仍在 config/，结构解析未改变。
- 生图：“选定素材 → 排版 / 发布”；各用途说明和风格提示仍保存在原配置，生成时仍使用。
- 商单：待处理 / 跟进中 / 已完成各状态定义仍在 config/deals.yaml，本轮仅移出按钮内的解释，不改状态定义。
- 收件箱：分类规则仍在 config/inbox.yaml；保留原消息、不自动回复、未识别不猜测分类等约束仍由业务代码实现。
- 收件箱成功采集日志中的范围与限制：原文见 inbox-operational-notes.json；失败或无入口的实际原因仍显示在页面。
- 所有原始 PRD 业务规则、真实上传 E/F 确认门槛、计数和分类规则均不受界面清理影响。
