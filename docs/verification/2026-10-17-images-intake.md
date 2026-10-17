# 第 8 步接入检查：等待用户确认

第 3 步代码已提交并推送 9792818。三天自动观察仍在进行，不宣称时间性验收已完成。

本地核对：`src/app/api/images/generate/route.ts` 仍返回“图片生成服务”不可用，尚未接生成服务；现有 Codex SDK 调用层用于文本判断和读图。本地 `.env.local` 没有已配置的 API Key，本次只检查配置项存在性，不输出密钥。

拟采用 OpenAI 图像 API 生成及改图，用现有 Node 内置 HTTP 能力，不新增依赖；图片写入 data/，数据库保存路径，沿用现有素材库、用途和比例契约。官方文档提供生成与编辑接口，调用使用 API Key：[Image generation](https://developers.openai.com/api/docs/guides/image-generation)。模型、参数和密钥读取方式待用户确认后落地。

等待确认：是否使用 OpenAI 图像 API，并由用户在本机 `.env.local` 配置 `OPENAI_API_KEY`。不要求在聊天中发送密钥。尚未调用收费接口、安装依赖或接入生图后端。停止依据是用户明确要求“做到第 8 步时，如果生图需要 OpenAI API Key 或新依赖，先停下问我”。
