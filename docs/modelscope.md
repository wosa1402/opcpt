# ModelScope 部署说明

## 推荐方式：拉取已构建的 GHCR 镜像

GitHub Actions 已经完成整套桌面镜像的构建。ModelScope 只需要使用仓库中的轻量部署目录：

```text
deploy/modelscope/
├── Dockerfile
└── ms_deploy.json
```

该 Dockerfile 使用经过验证的 OCI 摘要固定镜像版本，不使用可能随时变化的 `latest`。将来确认新版镜像正常后，再更新这里的摘要即可完成受控升级。

部署步骤：

1. 打开 ModelScope“创空间”，选择“创建创空间”。
2. 选择“编程式创空间”，切换到“快速部署并创建”。
3. 选择私有空间，将 `deploy/modelscope` 作为项目文件夹上传。
4. 使用 `platform/2v-cpu-16g-mem`，服务端口保持 `7860`。
5. 配置下面列出的 Secrets 和 Variables，然后启动构建。

这个方式只拉取 GHCR 成品镜像，通常比在 ModelScope 重新执行 Debian、KDE Plasma、Chrome 和 OpenClaw 的完整安装更快、更稳定。如果平台无法访问 GHCR，可改为上传整个仓库；根目录的 `Dockerfile` 和 `ms_deploy.json` 会执行完整源码构建。

## 环境配置

无论使用成品镜像还是源码构建，都创建私有创空间。不要把带 root 桌面、浏览器资料和 OpenClaw 的实例作为公开应用运行。

设置以下变量：

| 名称 | 存储方式 | 示例含义 |
|---|---|---|
| `VNC_PASSWD` | Secret | 随机 VNC 密码，实际只使用前 8 字符 |
| `DEEPSEEK_API_KEY` | Secret | DeepSeek 兼容中转站密钥 |
| `DEEPSEEK_BASE_URL` | Variable | 中转站给出的完整 Base URL |
| `DEEPSEEK_MODEL_ID` | Variable | `deepseek-chat` 或 `deepseek-reasoner` |
| `DEEPSEEK_MODEL_NAME` | Variable | 界面显示名 |
| `DEEPSEEK_API` | Variable | `openai-completions` |

`VNC_PASSWD` 建议直接使用随机的 8 位密码，避免传统 VNC 只读取前 8 个字符造成输入混淆。`DEEPSEEK_BASE_URL` 必须是中转站要求的完整地址；镜像不会自动追加 `/v1`。

不要在 ModelScope 页面配置 `OPENCLAW_PERSIST_DIR`，入口脚本会检测 `/mnt/workspace` 并选择：

```text
/mnt/workspace/openclaw-data
```

## `/mnt/workspace` 的使用方式

ModelScope 官方把 `/mnt/workspace` 描述为持久化卷；实际实例可能显示为 `fuse.s3fs`。本镜像不会把 `/root`、Chrome 或 SQLite 直接放到该挂载点运行，而是把它当作版本化快照仓库：

```text
/root（本地高速运行）
  └─ 经过筛选和 SQLite 在线备份
       └─ /mnt/workspace/openclaw-data/snapshots
```

每份快照有独立名称和 SHA-256 文件。写入中断的 `.partial` 文件不会被恢复程序采用；最新版本校验失败时会尝试更早版本。默认保留最近 5 份。

转移、重命名或删除创空间仍可能丢失 `/mnt/workspace`。特别重要的数据应另存到 OSS、Git 仓库或其他独立存储。

## noVNC 救援链

容器启动时先拉起 Xvnc、noVNC 和内存守护，再恢复快照。Docker 健康检查不检查 OpenClaw Gateway，因此 OpenClaw 故障不会主动触发整个容器重启。

noVNC 默认启用 `Remote Resizing`，连接后会让远程桌面跟随浏览器可用尺寸，不再把固定的 `1600x900` 画面居中并留下大块黑边。如果浏览器或 VNC 客户端不支持动态分辨率，可从 noVNC 左侧控制栏的设置中改为 `Local Scaling`。

Chrome 由 Supervisor 启动一次，为 OpenClaw 提供本机浏览器控制接口。正常关闭 Chrome 后会保持关闭；异常崩溃才会自动重启。需要恢复时可双击 KDE 桌面的“Chrome（OpenClaw 受管）”，或在终端运行 `supervisorctl start chrome`。Chrome 停止不影响 noVNC 和 KDE 桌面，但会暂时禁用 OpenClaw 的浏览器操作。

普通应用 OOM 时，内存守护会优先停止 Chrome/OpenClaw，并尽量保护 Supervisor、Xvnc 和 noVNC。但以下情况无法由镜像避免短暂离线：

- 平台回收或重启整个实例；
- 宿主机故障或公网代理故障；
- 平台强制按 cgroup 整组终止容器；
- root 用户主动结束核心进程或修改相关配置。

## 从旧镜像迁移

若旧镜像已经把数据同步到 `/mnt/workspace/root`，首次启动新镜像时可临时设置：

```text
IMPORT_LEGACY_BACKUP=1
```

新镜像会按自己的白名单导入旧数据。确认运行正常并成功生成新快照后，立即改回 `0`，避免以后重复导入旧状态。

新建创空间通常不会自动共享原创空间的 `/mnt/workspace`。若需要迁移旧数据，先在新的私有空间完成空白环境测试，再在原创空间替换 Dockerfile，或先把旧备份复制到新空间。不要在确认新快照和重启恢复均正常前删除旧空间。

## 首次验收

1. 打开 noVNC，确认画面跟随浏览器尺寸并且 root KDE Plasma 6 桌面可用。
2. 运行 `openclaw-container-status`，确认 health 不依赖 OpenClaw。
3. 运行 `openclaw-backup-now`，确认生成快照及 SHA-256。
4. 重启 OpenClaw，确认 noVNC 不断开。
5. 深度重启创空间，确认快照自动恢复。
6. 最后再进行受控内存压测，观察 Chrome/OpenClaw 被回收而 noVNC 保持可访问。

免费计算资源没有 SLA。不要在尚未得到一份有效快照前进行故意 OOM 测试。
