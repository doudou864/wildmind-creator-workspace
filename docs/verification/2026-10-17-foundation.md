# 第 13 章第 1 步验收记录

## 已自动验证

- 严格类型检查、生产构建、Prettier 检查、全部现有 check 和新增自动保存检查通过。
- Vitest 覆盖：重复迁移保留数据、WAL、全部实体、两张长表的 NULL/0、动态 metric id、账号日期唯一、发布记录平台回执唯一与 requestId 去重、普通表无 revision、抓取日志起止与失败原因、重复结束保护、迁移失败前备份、备份轮转和 WAL 内容、配置动态增删、指标口径、登录判断与失去控制权停止。
- 真实 `data/workspace.db` 连续执行迁移成功，后续再次迁移仍保留 5 条账号检查记录。
- 真实 `config/metrics.yaml` 临时新增 `foundation_acceptance_test`，不改代码即被 loadConfig 读取；finally 恢复原文件，再读确认测试指标消失。
- 真实 `data/backups/` 连续生成超过 7 份后只保留 7 份。测试数据库恢复读取验证 WAL 中的数据也在备份里。
- 实际 ego 后台：抖音、小红书、B站、YouTube 检查为已登录；视频号为未登录。证据摘要在 foundation-login.json，不含 Cookie 或账号私密正文。
- 登录入口的 openLogin 实现实测打开抖音后台，已有登录时无需再扫码。四个平台登录资料写入 `data/browser/*.json`，权限 600，目录 700；不进 Git。

## 尚需用户参与的验收

- 视频号当前登录页，尚未实测登录后的页面标记；该平台配置空 positive，不猜“已登录”。用户登录后需核对一次真实页面再填配置。
- 本轮没有退出现有账号再扫码，也没有重启用户电脑。重启后运行 `npm run browser:check -- douyin`，确认仍为已登录；如平台已过期，用 `npm run browser:login -- douyin` 重新登录。
- 当前业务 CRUD/素材存储/AI/采集仍未接入。自动保存输入回归使用隔离请求，不能把数据库建好等同于页面已经能够保存业务资料。

## 依赖检查

仅新增用户批准的 5 个直接依赖。npm audit 报告 drizzle-kit 的开发依赖链存在 4 项中危告警；建议的自动修复会把 drizzle-kit 降到旧大版本，因此没有自动降级。生产依赖安装阶段未报告漏洞。本步没有启动 Drizzle Studio 或依赖中的开发服务。
