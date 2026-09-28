import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");
let checks = 0;

function check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const dockerfile = await read("Dockerfile");
const templateText = await read("docker/openclaw-template.json");
const template = JSON.parse(templateText);
const supervisor = await read("docker/supervisord.conf");
const entrypoint = await read("docker/bin/container-entrypoint");
const healthcheck = await read("docker/bin/healthcheck");
const backup = await read("docker/bin/openclaw-backup-now");
const restore = await read("docker/bin/openclaw-restore-latest");
const guardian = await read("docker/bin/memory-guardian");
const xvnc = await read("docker/bin/service-xvnc");
const novnc = await read("docker/bin/service-novnc");
const desktop = await read("docker/bin/service-desktop");
const openclawService = await read("docker/bin/service-openclaw");
const chrome = await read("docker/bin/start-chrome-session");
const compose = await read("compose.yaml");
const envExample = await read(".env.example");
const readme = await read("README.md");
const backupPaths = await read("docker/backup-paths.txt");
const backupExcludes = await read("docker/backup-excludes.txt");
const publishWorkflow = await read(".github/workflows/publish-image.yml");
const modelScopeDockerfile = await read("deploy/modelscope/Dockerfile");
const modelScopeDeploy = JSON.parse(await read("deploy/modelscope/ms_deploy.json"));
const modelScopeSourceDeploy = JSON.parse(await read("ms_deploy.json"));

check(/^FROM node:\$\{NODE_VERSION\}-bookworm-slim$/m.test(dockerfile), "Dockerfile must use the clean Node/Debian base");
check(!dockerfile.includes("ghcr.io/tunmax"), "Dockerfile must not inherit the shared image");
check(dockerfile.includes("ARG OPENCLAW_VERSION=2026.9.6"), "OpenClaw must be version-pinned");
check(dockerfile.includes('ENTRYPOINT ["/usr/bin/tini"'), "tini must remain PID 1");
check(!dockerfile.includes("groupmod --new-name openclaw"), "the desktop must no longer be converted to a non-root user");
check(dockerfile.includes("openclaw --version"), "the pinned OpenClaw binary must be checked during build");
check(dockerfile.includes("openclaw config validate --json"), "the OpenClaw template must be validated during the image build");
check(dockerfile.includes("OPENCLAW_COMPAT_API_KEY=build-validation-only"), "build validation must exercise the generic provider environment");
check(dockerfile.includes("inotify-tools"), "the persistence watcher dependency must be installed");
check(dockerfile.includes("xfce4-whiskermenu-plugin"), "the Windows-like application menu must be installed");

const deepseekProvider = template.models.providers["deepseek-compatible"];
check(deepseekProvider.apiKey === "${OPENCLAW_COMPAT_API_KEY}", "DeepSeek key must use the internal generic environment reference");
check(deepseekProvider.baseUrl === "${OPENCLAW_COMPAT_BASE_URL}", "DeepSeek base URL must use the internal generic environment reference");
check(deepseekProvider.api === "${OPENCLAW_COMPAT_API}", "DeepSeek API dialect must use the internal generic environment reference");
check(template.agents.defaults.model.primary === "deepseek-compatible/${OPENCLAW_COMPAT_MODEL_ID}", "the primary model must use the generic DeepSeek-compatible provider");
check(template.agents.defaults.thinkingDefault === "off", "model capabilities must not be guessed globally");
check(template.agents.defaults.maxConcurrent === 1, "agent concurrency must be limited");
check(template.agents.defaults.subagents.maxConcurrent === 1, "subagent concurrency must be limited");
check(template.memory.search.enabled === false, "embedding-backed memory search must be disabled by default");
check(template.plugins.entries["memory-core"].config.dreaming.enabled === false, "background dreaming must be disabled");
check(template.gateway.bind === "loopback", "OpenClaw Gateway must stay on loopback");
check(template.browser.profiles.desktop.cdpUrl === "http://127.0.0.1:9222", "Chrome CDP must stay on loopback");
check(template.browser.profiles.desktop.attachOnly === true, "OpenClaw must attach to supervised Chrome");
check(template.update.auto.enabled === false, "the running container must not self-update OpenClaw");

check(entrypoint.includes("export HOME=/root"), "runtime HOME must be local /root");
check(entrypoint.includes("persist_root=/mnt/workspace/openclaw-data"), "ModelScope snapshot root must be detected");
check(entrypoint.includes("persist_root=/data/openclaw-data"), "HF/local snapshot fallback must exist");
check(!entrypoint.includes('export HOME="${persist_root}'), "HOME must never point at the persistence mount");
check(entrypoint.includes("/run/openclaw-secrets/provider.env"), "provider credentials must stay in tmpfs-style runtime state");
check(entrypoint.includes("export OPENCLAW_COMPAT_API_KEY="), "the user-facing DeepSeek secret must be translated to a generic runtime variable");
check(!entrypoint.includes("export DEEPSEEK_API_KEY="), "the OpenClaw process must not receive the auto-discovery DeepSeek variable");
check(entrypoint.indexOf("unset OPENCLAW_GATEWAY_TOKEN DEEPSEEK_BASE_URL DEEPSEEK_API_KEY") > entrypoint.indexOf("OPENCLAW_COMPAT_API_KEY"), "the user-facing provider variables must be removed before supervisor starts");
check(entrypoint.includes("拒绝以无密码 VNC 启动"), "entrypoint must reject passwordless VNC");
check(entrypoint.includes("memory.oom.group"), "entrypoint must try to disable whole-cgroup OOM killing");
check(entrypoint.includes("set-oom-score -1000 entrypoint"), "supervisor ancestry must request maximum OOM protection");

check(supervisor.includes("[program:memory-guardian]"), "memory guardian must be supervised");
check(supervisor.includes("[program:bootstrap]"), "restore/bootstrap must be supervised independently");
check(supervisor.includes("[program:persistence]"), "persistence daemon must be supervised");
check(supervisor.includes("[program:user-startup]"), "root startup hook must be supervised");
check(!supervisor.includes("user=openclaw"), "all services must run as root");
check((supervisor.match(/user=root/g) ?? []).length >= 9, "supervised programs must explicitly run as root");
check(supervisor.indexOf("[program:novnc]") < supervisor.indexOf("[program:bootstrap]"), "noVNC must be ordered before restore/bootstrap");
check(supervisor.indexOf("[program:bootstrap]") < supervisor.indexOf("[program:openclaw]"), "OpenClaw must start after restore/bootstrap");

check(xvnc.includes("set-oom-score -1000"), "Xvnc must request OOM immunity");
check(novnc.includes("set-oom-score -1000"), "noVNC must request OOM immunity");
check(xvnc.includes("-localhost yes"), "VNC must listen on loopback only");
check(!xvnc.includes("-localhost no"), "VNC must never listen publicly");
check(desktop.includes("set-oom-score 300"), "desktop descendants must remain killable before rescue services");
check(openclawService.includes("set-oom-score 500"), "OpenClaw must be less protected than the desktop");
check(chrome.includes("set-oom-score 700"), "Chrome must be reclaimed before OpenClaw");
check((chrome.match(/--no-sandbox/g) ?? []).length === 1, "root Chrome must have one explicit no-sandbox flag");

check(healthcheck.includes("VNC_PORT"), "healthcheck must verify Xvnc");
check(healthcheck.includes("NOVNC_PORT"), "healthcheck must verify noVNC");
check(!healthcheck.includes("OPENCLAW_GATEWAY_PORT"), "healthcheck must not depend on OpenClaw");

check(backup.includes("sha256sum"), "snapshots must be checksummed");
check(backup.includes("snapshot-"), "snapshots must be versioned");
check(backup.includes(".backup"), "SQLite online backup must be used");
check(backup.includes("BACKUP_KEEP"), "snapshot retention must be bounded");
check(backup.includes("BACKUP_MAX_MIB"), "snapshot staging size must be bounded");
check(backup.includes("/root/.openclaw/npm/projects"), "user-installed OpenClaw plugin payloads must survive an offline restore");
check(!backup.includes("rclone sync"), "unversioned rclone mirroring must not return");
check(!backup.includes("--ignore-errors"), "destructive ignore-errors sync behavior must not return");
check(restore.includes("sha256sum"), "restore must validate snapshot checksums");
check(restore.includes("尝试更早版本"), "restore must fall back to older snapshots");
check(restore.includes("IMPORT_LEGACY_BACKUP"), "legacy import must require an explicit switch");

check(guardian.includes("stop_service chrome"), "memory guardian must shed Chrome first");
check(guardian.indexOf("stop_service chrome") < guardian.indexOf("stop_service openclaw"), "Chrome must be shed before OpenClaw");
check(guardian.includes("largest_killable"), "emergency pressure must have a non-core process fallback");
check(guardian.includes("supervisord|Xtigervnc|websockify|memory-guardian|tini|dbus-daemon"), "rescue processes must be excluded from emergency selection");

check(backupPaths.includes(".openclaw"), "OpenClaw state must be backed up");
check(backupPaths.includes(".config/google-chrome"), "Chrome profile must be backed up");
check(backupPaths.includes("Projects"), "user projects must be backed up");
check(backupPaths.includes("Startup"), "root startup automation must be backed up");
check(backupExcludes.includes("node_modules"), "rebuildable dependency trees must be excluded");
check(backupExcludes.includes(".openclaw/cache"), "rebuildable OpenClaw cache data must be excluded");
check(backupExcludes.includes("*-wal"), "live WAL files must not be copied directly");

check(compose.includes("OPENCLAW_PERSIST_DIR: /data/openclaw-data"), "local compose must use the mounted snapshot directory");
check(compose.includes('"127.0.0.1:7860:7860"'), "local compose port must bind to loopback");
check(/^VNC_PASSWD=\s*$/m.test(envExample), "example VNC secret must be blank");
check(/^DEEPSEEK_API_KEY=\s*$/m.test(envExample), "example DeepSeek secret must be blank");
check(/^DEEPSEEK_BASE_URL=\s*$/m.test(envExample), "example relay URL must be blank");
check(envExample.includes("MEMORY_CRITICAL_PERCENT=88"), "memory protection defaults must be documented in env example");
check(readme.includes("/root（本地高速运行）") || readme.includes("`/root` 是高速运行目录"), "README must describe local runtime storage");
check(readme.includes("平台回收"), "README must state the whole-container failure boundary");
check(publishWorkflow.includes("packages: write"), "GitHub Actions must have permission to publish to GHCR");
check(publishWorkflow.includes("platforms: linux/amd64"), "cloud image builds must target the deployment architecture explicitly");
check(publishWorkflow.includes("password: ${{ secrets.GITHUB_TOKEN }}"), "GHCR publishing must use GitHub's ephemeral workflow token");
check(!publishWorkflow.includes("DEEPSEEK_API_KEY"), "runtime provider credentials must not be exposed to image builds");
check(!publishWorkflow.includes("VNC_PASSWD"), "the VNC password must not be exposed to image builds");
check(/^FROM ghcr\.io\/wosa1402\/opcpt@sha256:[0-9a-f]{64}$/m.test(modelScopeDockerfile), "ModelScope must pin the prebuilt image by OCI digest");
check(!modelScopeDockerfile.includes(":latest"), "ModelScope deployment must not float on the latest tag");
check(modelScopeDockerfile.includes("EXPOSE 7860"), "ModelScope deployment must expose port 7860");
check(modelScopeDeploy.sdk_type === "docker", "ModelScope prebuilt deployment must use the Docker SDK");
check(modelScopeDeploy.resource_configuration === "platform/2v-cpu-16g-mem", "ModelScope prebuilt deployment must target 2 CPU and 16 GB RAM");
check(modelScopeDeploy.port === 7860, "ModelScope prebuilt deployment must publish port 7860");
check(JSON.stringify(modelScopeSourceDeploy) === JSON.stringify(modelScopeDeploy), "source and prebuilt ModelScope deployment settings must stay aligned");

const binNames = (await readdir(path.join(root, "docker/bin"))).sort();
const runtimeTexts = [dockerfile, templateText, supervisor];
for (const name of binNames) {
  const script = await read(`docker/bin/${name}`);
  runtimeTexts.push(script);
  check(script.startsWith("#!/usr/bin/env bash\n"), `${name} must be a Bash script`);
}
check(dockerfile.includes("find /usr/local/bin -maxdepth 1 -type f -exec chmod 0755"), "all runtime scripts must be executable");

const runtimeText = runtimeTexts.join("\n");
check(!runtimeText.includes("OPENCLAW_CUSTOM_"), "obsolete generic provider variables must not remain in runtime files");
check(!templateText.includes("${DEEPSEEK_API_KEY}"), "the OpenClaw template must not trigger DeepSeek plugin auto-discovery");
check(!runtimeText.includes("MODELSCOPE_API_KEY"), "runtime must not depend on a ModelScope model key");
check(!/(?:sk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{16,}/.test(runtimeText), "runtime must not contain a recognizable embedded token");

const sizeChecked = [
  "Dockerfile",
  "compose.yaml",
  ".env.example",
  "docker/openclaw-template.json",
  "docker/backup-paths.txt",
  "docker/backup-excludes.txt",
  ...binNames.map((name) => `docker/bin/${name}`),
];
for (const relativePath of sizeChecked) {
  const info = await stat(path.join(root, relativePath));
  check(info.size < 1_000_000, `${relativePath} is unexpectedly large`);
}

console.log(`Static validation passed (${checks} checks).`);
