# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=24.16.0
FROM node:${NODE_VERSION}-trixie-slim

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

ARG OPENCLAW_VERSION=2026.9.6

LABEL org.opencontainers.image.title="OpenClaw Rescue Desktop"
LABEL org.opencontainers.image.description="A root KDE Plasma 6 OpenClaw desktop with a protected noVNC rescue path and versioned recovery"

ENV DEBIAN_FRONTEND=noninteractive \
    OPENCLAW_VERSION=${OPENCLAW_VERSION} \
    LANG=zh_CN.UTF-8 \
    LC_ALL=zh_CN.UTF-8 \
    LANGUAGE=zh_CN:zh \
    TZ=Asia/Shanghai \
    DISPLAY=:1 \
    VNC_PORT=5901 \
    NOVNC_PORT=7860 \
    CHROME_CDP_PORT=9222 \
    OPENCLAW_GATEWAY_PORT=18789 \
    DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/0/bus \
    OPENCLAW_DISABLE_BONJOUR=1 \
    OPENCLAW_NO_AUTO_UPDATE=1 \
    MALLOC_ARENA_MAX=2 \
    NO_AT_BRIDGE=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ark \
        ca-certificates \
        btop \
        curl \
        dbus \
        dbus-x11 \
        dolphin \
        fcitx5 \
        fcitx5-chinese-addons \
        fcitx5-config-qt \
        fcitx5-frontend-gtk3 \
        fcitx5-frontend-qt5 \
        fcitx5-frontend-qt6 \
        fonts-noto-cjk \
        fonts-noto-color-emoji \
        git \
        gnupg \
        htop \
        inotify-tools \
        iproute2 \
        jq \
        kate \
        kde-plasma-desktop \
        kde-spectacle \
        konsole \
        kwin-x11 \
        less \
        lsof \
        locales \
        nano \
        netcat-openbsd \
        openssh-client \
        openssl \
        p7zip-full \
        plasma-systemmonitor \
        procps \
        psmisc \
        rsync \
        sqlite3 \
        supervisor \
        tigervnc-standalone-server \
        tigervnc-tools \
        tini \
        tmux \
        tree \
        tzdata \
        unzip \
        util-linux \
        websockify \
        novnc \
        x11-xserver-utils \
        xauth \
        xdg-utils \
        xdg-user-dirs \
        zip \
        zstd \
    && sed -i 's/^# *zh_CN.UTF-8 UTF-8/zh_CN.UTF-8 UTF-8/' /etc/locale.gen \
    && locale-gen \
    && ln -snf /usr/share/zoneinfo/${TZ} /etc/localtime \
    && echo "${TZ}" > /etc/timezone \
    && test "$(dpkg --print-architecture)" = "amd64" \
    && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
        | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main' \
        > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

RUN install -d -m 0700 /root \
    && install -d -m 0750 /data /var/log/openclaw \
    && install -d -m 0700 /run/user/0

RUN npm install --global "openclaw@${OPENCLAW_VERSION}" \
    && npm cache clean --force \
    && openclaw --version

COPY docker/openclaw-template.json /usr/local/share/openclaw/openclaw-template.json
COPY docker/backup-paths.txt /usr/local/share/openclaw/backup-paths.txt
COPY docker/backup-excludes.txt /usr/local/share/openclaw/backup-excludes.txt
COPY docker/fcitx5-default/ /usr/local/share/openclaw/fcitx5-default/
COPY docker/plasma-default/ /usr/local/share/openclaw/plasma-default/
COPY docker/desktop-default/ /usr/local/share/openclaw/desktop-default/
COPY docker/novnc-index.html /usr/local/share/openclaw/novnc-index.html
COPY docker/supervisord.conf /etc/supervisor/conf.d/openclaw.conf
COPY docker/bin/ /usr/local/bin/

RUN HOME=/root \
        OPENCLAW_STATE_DIR=/tmp/openclaw-build-validate \
        OPENCLAW_CONFIG_PATH=/usr/local/share/openclaw/openclaw-template.json \
        OPENCLAW_COMPAT_BASE_URL=http://127.0.0.1:9/v1 \
        OPENCLAW_COMPAT_API_KEY=build-validation-only \
        OPENCLAW_COMPAT_MODEL_ID=deepseek-chat \
        OPENCLAW_COMPAT_MODEL_NAME='DeepSeek Chat' \
        OPENCLAW_COMPAT_API=openai-completions \
        OPENCLAW_GATEWAY_TOKEN=build-validation-token-000000000000 \
        openclaw config validate --json \
    && rm -rf /tmp/openclaw-build-validate \
    && find /usr/local/bin -maxdepth 1 -type f -exec chmod 0755 {} + \
    && find /usr/local/share/openclaw/desktop-default -type f -name '*.desktop' -exec chmod 0755 {} + \
    && command -v startplasma-x11 > /dev/null \
    && command -v kwin_x11 > /dev/null \
    && command -v plasmashell > /dev/null \
    && command -v fcitx5-remote > /dev/null \
    && command -v fcitx5-config-qt > /dev/null \
    && command -v kreadconfig6 > /dev/null \
    && command -v kwriteconfig6 > /dev/null \
    && grep -Fq "UI.initSetting('resize', 'off');" /usr/share/novnc/app/ui.js \
    && sed -i "s/UI.initSetting('resize', 'off');/UI.initSetting('resize', 'remote');/" /usr/share/novnc/app/ui.js \
    && rm -f /usr/share/novnc/index.html \
    && install -m 0644 /usr/local/share/openclaw/novnc-index.html /usr/share/novnc/index.html

EXPOSE 7860

HEALTHCHECK --interval=20s --timeout=8s --start-period=60s --retries=5 \
    CMD ["/usr/local/bin/healthcheck"]

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/container-entrypoint"]
