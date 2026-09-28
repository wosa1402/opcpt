# 已确认的设计方案

## 用户目标

- 长期使用 root 桌面，方便安装和部署软件。
- 使用 Debian 13 的 KDE Plasma 6 X11 会话，提供适合 Windows 用户的现代底部任务栏和开始菜单布局。
- noVNC 默认请求 Remote Resizing，使桌面分辨率跟随浏览器窗口；不支持时可手动回退到 Local Scaling。
- Chrome 容器启动时运行一次，正常关闭后保持关闭，异常退出时才自动恢复。
- noVNC/Xvnc 是最高优先级救援通道；OpenClaw、Chrome 和用户程序不能成为桌面失联的单点。
- DeepSeek 官方兼容接口，只替换中转 Base URL 和密钥。
- 用户侧 `DEEPSEEK_*` 参数进入 OpenClaw 前会转换为通用内部变量，避免启动时联网自动安装官方 DeepSeek 插件。
- ModelScope 的 s3fs 仅作持久化快照仓库，不承载实时数据库。

## 故障顺序

1. 80% 内存：预警。
2. 88% 内存：停止 Chrome。
3. 94% 内存：停止 OpenClaw；仍不足时终止最大的非核心进程。
4. 72% 以下稳定一段时间：先恢复 OpenClaw，再恢复 Chrome。
5. 整个容器重启：noVNC/Xvnc 先上线，随后校验并恢复数据。

## 不能承诺的边界

单一 Docker 容器无法让 noVNC 在平台回收、宿主机故障或 cgroup 整组终止时继续存活。真正的硬隔离需要把救援桌面和业务程序放进不同容器/cgroup；ModelScope 单容器环境不提供这一保证。

## 上线前验收

- Bash、JSON、YAML 和密钥扫描通过。
- OpenClaw 固定版本的配置校验通过。
- Docker 真实构建通过。
- noVNC 在 OpenClaw/Chrome 单独崩溃时保持连接。
- 内存压测中核心救援链保持可访问。
- 最新快照损坏时能回退到上一版本。
- 容器深度重启后能恢复工作区、OpenClaw 状态和 Chrome 登录资料。
