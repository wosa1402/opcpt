---
title: OpenClaw Rescue Desktop
emoji: 🦞
colorFrom: blue
colorTo: orange
sdk: docker
app_port: 7860
pinned: false
short_description: 优先保住 noVNC、支持 DeepSeek 中转和版本化恢复的 root 云桌面
---

# OpenClaw Rescue Desktop

这是面向 ModelScope Docker 创空间的 root Linux 云桌面，也可用于 Hugging Face Docker Space 和本地 Docker。它从干净的 Debian 13/Node 基础镜像构建，包含 Windows 用户容易上手的 KDE Plasma 6、Chrome、OpenClaw、TigerVNC 和 noVNC，固定使用 OpenClaw `2026.9.6` 与 Node `24.16.0`。

镜像不继承 `ghcr.io/tunmax/openclaw_computer`，但保留了它“本地运行、持久盘备份、重建时恢复”的合理思路，并重新实现了快照校验、历史版本、内存保护和服务监管。

## 最重要的设计

- `/root` 是高速运行目录；SQLite、Chrome LevelDB 和桌面程序不会直接运行在 ModelScope 的 s3fs 上。
- `/mnt/workspace/openclaw-data/snapshots` 只保存带 SHA-256 校验的版本化快照。
- noVNC 默认使用 Remote Resizing，让远程分辨率跟随浏览器可用区域；不支持动态调整的客户端仍可在 noVNC 设置中改用 Local Scaling。
- KDE 底部任务栏默认固定贴边，不会再随窗口位置在悬浮和贴边样式之间切换。
- 内置 Fcitx 5 拼音，默认保持英文，像 Windows 一样按 `Ctrl+Shift` 在英文和拼音之间切换。
- noVNC、Xvnc、Supervisor 和内存守护程序属于救援链；Chrome、OpenClaw 和其他程序在内存不足时优先被回收。
- Docker 健康检查只检查 VNC/noVNC，不依赖 OpenClaw。Agent 崩溃不会让平台把可用桌面误判为失效。
- noVNC/Xvnc 先启动，数据恢复、桌面、OpenClaw 和 Chrome 随后启动。
- 所有日常操作都以 root 运行，便于在一次性云电脑里安装和部署软件。
- 模型渠道按 DeepSeek 官方兼容协议配置；中转站只需要替换 Base URL。

同一容器里的进程无法抵抗平台回收、宿主机故障或 cgroup 整组终止。如果整个容器被平台停止，noVNC 仍会短暂离线；本镜像能做的是尽量避免普通应用 OOM 杀死救援链，并在容器重新启动时最先恢复 noVNC。

## 必填配置

| 名称 | 类型 | 说明 |
|---|---|---|
| `VNC_PASSWD` | Secret | noVNC 登录密码；传统 VNC 只使用前 8 个字符。 |
| `DEEPSEEK_API_KEY` | Secret | 你的 DeepSeek 官方兼容中转站密钥。 |
| `DEEPSEEK_BASE_URL` | Variable | 中转站提供的完整 Base URL，镜像不会自动添加 `/v1`。 |
| `DEEPSEEK_MODEL_ID` | Variable | 默认 `deepseek-chat`；可改为 `deepseek-reasoner`。 |
| `DEEPSEEK_MODEL_NAME` | Variable | 界面显示名，默认 `DeepSeek Chat`。 |
| `DEEPSEEK_API` | Variable | 默认 `openai-completions`。 |

API key 只写入容器的 `/run/openclaw-secrets`，不会进入镜像、OpenClaw 配置或持久化快照。入口脚本会把外部的 `DEEPSEEK_*` 参数转换成内部通用变量，因此 OpenClaw 不会在启动时误判为官方 DeepSeek 直连并临时下载插件。不要把真实密钥或密码提交到仓库或发到聊天中。

## 启动顺序

```text
Supervisor / Xvnc / noVNC / memory-guardian
                    ↓
        校验并恢复最近可用快照
                    ↓
          KDE Plasma 6 root 桌面
                    ↓
       用户启动脚本 / OpenClaw / Chrome
```

恢复很慢或快照损坏时，noVNC 页面仍应先上线。恢复程序会验证最新快照，失败时自动尝试更早版本；所有版本都不可用时按全新环境启动，不会无限阻塞桌面。

## 持久化范围

默认备份以下 root 数据：

- `.openclaw`、Chrome 用户资料、KDE Plasma 与输入法配置；
- `Desktop`、`Documents`、`Downloads`；
- `Projects`、`Services`、`Startup`；
- shell 历史和 Git 基础配置。

缓存、Chrome 临时锁、WAL/SHM、普通项目的 `node_modules`、Python 虚拟环境和下载中的 `.crdownload` 会被排除。用户主动安装的 OpenClaw 插件及其固定依赖会保留，避免恢复后临时联网重装。OpenClaw 与 Chrome 中可识别的 SQLite 文件使用在线备份 API 生成一致副本；LevelDB 等数据依靠多版本快照提供回退空间。

默认参数：首次启动后 60 秒开始，事件触发后至少间隔 120 秒，最长 15 分钟生成一次快照，保留最近 5 份，单次暂存数据上限 4096 MiB。可通过 `.env.example` 中的 `BACKUP_*` 参数调整。

Chrome 登录资料也在备份中，因此快照属于敏感数据。请使用私有创空间，不要公开 `/mnt/workspace` 的内容。

## 后续安装的软件

运行时执行的 `apt install` 会随着容器重建消失，这是 Docker 的正常行为。每份快照会保存当时的手动软件包清单，但不会盲目修改新镜像的系统目录。

需要自动重装或重新启动的命令可以写到：

```text
/root/Startup/startup.sh
```

该脚本在数据恢复后以 root 执行，并受到较高 OOM 优先级约束。项目代码和业务数据建议放入 `/root/Projects`、`/root/Services` 或 `/root/Documents`，不要依赖 `/tmp`。

## 内存保护

默认阈值针对 2 vCPU / 16 GB：

- 80%：记录预警；
- 88%：停止 Chrome；
- 94%：停止 OpenClaw，必要时终止最大的非核心进程；
- 降至 72% 并稳定后：先恢复 OpenClaw，再恢复 Chrome。

核心进程尝试设置 `oom_score_adj=-1000`。若平台不授予相应 capability，镜像会退化为“提高其他进程 OOM 分数＋提前回收内存”。容器若被设置为 `memory.oom.group=1`，入口脚本会在权限允许时改为 `0`；只读 cgroup 无法由镜像改变。

桌面中有“系统与内存状态”和“立即备份”快捷方式，也可以在终端运行：

```bash
openclaw-container-status
openclaw-backup-now
supervisorctl status
supervisorctl restart openclaw
```

这些命令不会输出 API key 或 VNC 密码。

Chrome 在容器启动时会启动一次，供 OpenClaw 通过本机 CDP 使用。用户正常关闭所有 Chrome 窗口后，Supervisor 不会再强制拉起；异常退出仍会自动恢复。需要重新启动时，双击桌面的“Chrome（OpenClaw 受管）”，或运行：

```bash
supervisorctl start chrome
```

## 中文输入法

镜像内置 Fcitx 5 和拼音词库。桌面启动后默认是英文键盘，像 Windows 一样单独按一次 `Ctrl+Shift` 即可切换为拼音，再按一次返回英文；左右 Shift 均可。桌面上的“中文输入法设置”可以调整输入法顺序、候选词和快捷键。

输入法配置位于 `/root/.config/fcitx5`，会进入版本化快照并在容器重建后恢复。如果某个已经打开的程序没有识别输入法，关闭该程序后重新打开即可，不需要重启整个容器。

## ModelScope

推荐将 [deploy/modelscope](deploy/modelscope) 文件夹作为项目文件夹上传到 ModelScope“编程式创空间”。其中的轻量 Dockerfile 固定拉取一份已验证的 GHCR 镜像，不会在 ModelScope 重新安装整套桌面依赖。根目录也提供了 [ms_deploy.json](ms_deploy.json)，需要从源码重新构建时可上传整个仓库。

创建私有 Docker 创空间，资源选择 `platform/2v-cpu-16g-mem`，服务端口保持 `7860`。在平台 Secret 中设置 `VNC_PASSWD` 和 `DEEPSEEK_API_KEY`，再把完整的中转地址配置为普通变量 `DEEPSEEK_BASE_URL`。不要配置 `OPENCLAW_PERSIST_DIR`。

完整步骤、旧数据迁移和首次验收见 [docs/modelscope.md](docs/modelscope.md)。入口脚本检测到可写的 `/mnt/workspace` 后，自动把快照目录设为 `/mnt/workspace/openclaw-data`；运行目录始终是本地 `/root`。

## GitHub 自动构建镜像

推送到 GitHub 的 `main` 分支后，GitHub Actions 会先运行静态检查，再为 `linux/amd64` 构建镜像并发布到 GitHub Container Registry（GHCR）：

```text
ghcr.io/wosa1402/opcpt:latest
ghcr.io/wosa1402/opcpt:sha-<提交短哈希>
```

推送 `v1.0.0` 这类 Git 标签时还会生成同名镜像标签。部署时建议固定使用 `sha-*` 或版本标签，确认新版本正常后再切换，便于快速回退。

构建过程只使用 GitHub 自动提供的 `GITHUB_TOKEN` 发布镜像。不要把 `VNC_PASSWD`、`DEEPSEEK_API_KEY` 或其他运行密钥配置成构建参数；它们只能在最终部署平台中以 Secret 的形式提供。GHCR 包首次发布后可能是私有状态，外部平台无法匿名拉取时，需要在 GitHub Package 设置中改为公开，或者给部署平台配置只读容器仓库凭据。

## Hugging Face Spaces

新建 Private Docker Space，上传本项目并设置上述 Secrets/Variables。需要跨重建保留数据时必须购买或启用挂载到 `/data` 的 Persistent Storage；免费临时盘没有持久化保证。示例见 [docs/huggingface-space-README.example.md](docs/huggingface-space-README.example.md)。

## 本地运行

```powershell
Copy-Item .env.example .env
# 只在本机编辑 .env，填入 VNC 密码和 DeepSeek 中转配置
docker compose up -d --build
```

然后访问 `http://127.0.0.1:7860`。数据快照会写入项目下的 `./data/openclaw-data`。

## root 与浏览器安全边界

Chrome 不能以 root 使用 Chromium sandbox，因此本镜像明确使用 `--no-sandbox`。OpenClaw 也拥有 root 命令执行能力。请只部署在私有空间，使用随机 VNC 密码，不要挂载个人电脑目录、Docker socket 或宿主机 SSH 凭据，也不要把该桌面直接作为公开网站使用。

## 校验

```bash
npm test
```

有 Docker 的环境还应执行真实构建、OOM 压测、快照损坏回退和容器重启恢复测试。本机没有 Docker 时，静态检查通过不等于云平台运行验证通过。
