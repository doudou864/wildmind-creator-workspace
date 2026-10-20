# 后台采集：由你在本机安装

在项目目录运行：

```sh
npm run collect:install
```

会写入 `~/Library/LaunchAgents/com.wildmind.creator.collect.plist` 并加载当前登录用户的后台任务。每 30 秒检查一次是否到计划时间，实际采集仍按 `config/parameters.yaml` 的同步窗口和重试时刻执行，不会每 30 秒采集一遍。电脑醒着、用户已登录、平台会话有效时才可能完成采集；睡眠期间不运行，唤醒后只补最近一个到期时段，不连续追补所有错过的时段。

卸载：

```sh
npm run collect:uninstall
```

只卸载后台任务和对应 plist，不删除数据库、素材、日志。修改项目路径或 Node 路径后重新安装。

只检查配置、不安装：

```sh
npm run collect:install -- --dry-run
npm run collect:uninstall -- --dry-run
```

安装后查看状态：

```sh
launchctl print gui/$(id -u)/com.wildmind.creator.collect
```

日志在 `data/jobs/collector.log` 和 `data/jobs/collector-errors.log`。采集失败或最近成功超过 24 小时会触发系统通知；相同问题不会每次检查都弹，恢复或问题改变后重新记录。系统通知受 macOS 通知权限、专注模式和登录会话限制；如没出现，请在系统设置中检查通知权限。

本轮只执行 dry-run 与 plist 语法校验，**没有安装、卸载或强行触发真实采集**。请你执行安装命令后，在计划窗口确认日志有新一次运行、今天页更新时间同步、系统通知能出现，之后才算后台实机验收完成。
