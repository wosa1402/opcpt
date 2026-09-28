# ModelScope 部署说明

## 创建与配置

创建支持 Dockerfile 的私有创空间，公开服务端口保持 `7860`。建议先使用 `platform/2v-cpu-16g-mem` 规格验证。

设置以下变量：

| 名称 | 存储方式 | 示例含义 |
|---|---|---|
| `VNC_PASSWD` | Secret | 随机 VNC 密码，实际只使用前 8 字符 |
| `DEEPSEEK_API_KEY` | Secret | DeepSeek 兼容中转站密钥 |
| `DEEPSEEK_BASE_URL` | Variable | 中转站给出的完整 Base URL |
| `DEEPSEEK_MODEL_ID` | Variable | `deepseek-chat` 或 `deepseek-reasoner` |
| `DEEPSEEK_MODEL_NAME` | Variable | 界面显示名 |
| `DEEPSEEK_API` | Variable | `openai-completions` |

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

## 首次验收

1. 打开 noVNC 并确认 root XFCE 桌面可用。
2. 运行 `openclaw-container-status`，确认 health 不依赖 OpenClaw。
3. 运行 `openclaw-backup-now`，确认生成快照及 SHA-256。
4. 重启 OpenClaw，确认 noVNC 不断开。
5. 深度重启创空间，确认快照自动恢复。
6. 最后再进行受控内存压测，观察 Chrome/OpenClaw 被回收而 noVNC 保持可访问。

免费计算资源没有 SLA。不要在尚未得到一份有效快照前进行故意 OOM 测试。
