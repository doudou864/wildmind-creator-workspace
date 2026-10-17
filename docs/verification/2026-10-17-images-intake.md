# 第 8 步：Codex 套餐生图验证

用户已明确更正：只用本机 ChatGPT 登录的 Codex CLI / SDK，通过现有 src/ai 接入；不使用图像 API，不配置 API 密钥。此前拟议的 API 接入方案取消。

第3步遗留已完成（b77f50c）：三平台真实采集各5条，49项测试及check全绿。下一步实际生成一张图片，再测试已有图片编辑/参考图与3:4、9:16、16:9比例，核对输出文件和耗时。不可用就停止，不进行后端生图开发或切换API。

本机只读检查：codex-cli 0.154.0，登录状态为 ChatGPT，image_generation 功能开启。以上只说明入口存在，不能代替实际生成成功。

官方文档说明CLI可通过内置生图使用Codex额度：[Image generation](https://learn.chatgpt.com/docs/image-generation)。本机真实验证结果待追加。
