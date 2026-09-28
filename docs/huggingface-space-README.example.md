---
title: OpenClaw Rescue Desktop
emoji: 🦞
colorFrom: blue
colorTo: orange
sdk: docker
app_port: 7860
pinned: false
short_description: 优先保住 noVNC 的 DeepSeek OpenClaw root 云桌面
---

# OpenClaw Rescue Desktop

将项目完整上传到 Private Hugging Face Docker Space，然后配置：

- Secrets：`VNC_PASSWD`、`DEEPSEEK_API_KEY`
- Variables：`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL_ID`、`DEEPSEEK_MODEL_NAME`、`DEEPSEEK_API`

`DEEPSEEK_API` 默认使用 `openai-completions`。镜像不会自动给 `DEEPSEEK_BASE_URL` 添加 `/v1`。

要跨重建保留数据，必须开通挂载到 `/data` 的 Persistent Storage。运行数据在本地 `/root`，版本化快照保存在 `/data/openclaw-data/snapshots`；免费临时磁盘不能提供这一保证。
