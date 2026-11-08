const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process");
function installerSession(root, env, { isolated = false } = {}) {
  if (process.platform !== "win32") throw Error("安装验收需要真实 Windows");
  root = path.resolve(root);
  fs.mkdirSync(root, { recursive: true });
  const powershell = path.join(root, "installer-step.ps1");
  fs.writeFileSync(powershell, require("./windows-install-powershell.cjs"));
  let initial,
    owned = null;
  const measurements = [];
  const { LAB_GUID, LAB_NAME } = require("./migration-install-profile.cjs");
  let protectedEntries = [],
    protectedFiles = [];
  const hashFile = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const entryFingerprint = (entries) =>
    JSON.stringify(
      entries
        .map((a) => ({
          key: a.key,
          name: a.name,
          directory: a.directory,
          version: a.version,
          uninstall: a.uninstall,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    );
  const ownedEntries = (state) =>
    isolated
      ? state.apps.filter((a) => a.key.toLowerCase() === LAB_GUID)
      : state.apps;
  function verifyProtected(state = inspect()) {
    if (!isolated || !initial) return;
    if (
      entryFingerprint(
        state.apps.filter((a) => a.key.toLowerCase() !== LAB_GUID),
      ) !== entryFingerprint(protectedEntries)
    )
      throw Error("原有安装注册表发生变化，验收未通过");
    for (const entry of protectedFiles)
      if (!fs.existsSync(entry.file) || hashFile(entry.file) !== entry.sha256)
        throw Error("原有客户端快捷方式或安装缓存发生变化，验收未通过");
  }
  function command(value) {
    const file = path.join(
      root,
      "installer-plan-" + crypto.randomUUID() + ".json",
    );
    fs.writeFileSync(file, JSON.stringify({ ...value, root }));
    const installerSha256 = value.action === "install" ? hashFile(value.installer) : undefined;
    const started = Date.now();
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        powershell,
        file,
      ],
      { env, encoding: "utf8", windowsHide: true },
    );
    if (["install", "uninstall"].includes(value.action)) measurements.push({ action: value.action, installerSha256, elapsedMs: Date.now() - started, exitCode: result.status, scope: "PowerShell orchestration plus actual NSIS process; installer file previously hashed" });
    fs.writeFileSync(
      file + ".log",
      String(result.stdout || "") + String(result.stderr || ""),
    );
    if (result.error || result.status !== 0)
      throw Error("Windows 安装步骤失败；见隔离验收目录");
    return JSON.parse(result.stdout.replace(/^\uFEFF/, ""));
  }
  const inspect = () => command({ action: "inspect" }),
    normalized = (value) =>
      path
        .resolve(value)
        .toLowerCase()
        .replace(/[\\/]+$/, "");
  function ensureOwned() {
    const state = inspect(),
      apps = ownedEntries(state);
    verifyProtected(state);
    if (
      !owned ||
      apps.length !== 1 ||
      !apps[0].directory ||
      normalized(apps[0].directory) !== normalized(owned)
    )
      throw Error("安装注册表已不属于测试副本，未执行卸载或覆盖");
  }
  return {
    get measurements() { return measurements.map(value => ({ ...value })); },
    inspect,
    prepare() {
      initial = inspect();
      if (ownedEntries(initial).length || initial.running.length)
        throw Error(
          "已有 Scrylet / Snap-Solver 安装或 Electron 正在运行；未覆盖用户会话",
        );
      const backup = [];
      if (isolated) {
        protectedEntries = initial.apps.filter(
          (a) => a.key.toLowerCase() !== LAB_GUID,
        );
        const labShortcuts = initial.shortcuts.filter((file) =>
          file.includes(LAB_NAME),
        );
        if (labShortcuts.some((file) => fs.existsSync(file)))
          throw Error("隔离验收快捷方式名称已存在，未覆盖");
        const files = [
          ...initial.shortcuts.filter((file) => !file.includes(LAB_NAME)),
          path.join(process.env.LOCALAPPDATA, "scrylet-updater/installer.exe"),
        ];
        protectedFiles = files
          .filter((file) => fs.existsSync(file))
          .map((file) => ({ file, sha256: hashFile(file) }));
      }
      for (const file of initial.shortcuts)
        if (fs.existsSync(file) && (!isolated || file.includes(LAB_NAME))) {
          const name = path.join(root, "shortcut-" + backup.length + ".lnk");
          fs.copyFileSync(file, name);
          backup.push({
            file,
            backup: name,
            sha256: crypto
              .createHash("sha256")
              .update(fs.readFileSync(file))
              .digest("hex"),
          });
        }
      fs.writeFileSync(
        path.join(root, "shortcut-backups.json"),
        JSON.stringify(backup),
      );
      return {
        existingInstallations: initial.apps.length,
        preservedExistingInstallations: protectedEntries.length,
        originalShortcuts: backup.length,
        isolatedNsisGuid: isolated ? LAB_GUID : null,
      };
    },
    install(installer, directory) {
      directory = path.resolve(directory);
      if (inspect().running.length)
        throw Error("检测到正在运行的 Electron / Scrylet，未启动覆盖安装");
      if (owned) ensureOwned();
      else if (ownedEntries(inspect()).length)
        throw Error("出现新的验收命名空间安装，未覆盖");
      verifyProtected();
      owned = directory;
      command({
        action: "install",
        installer: path.resolve(installer),
        directory,
      });
      ensureOwned();
      if (!fs.existsSync(path.join(directory, "Scrylet.exe")))
        throw Error("测试安装位置不符");
      return path.join(directory, "Scrylet.exe");
    },
    uninstall() {
      if (!owned) return;
      if (inspect().running.length)
        throw Error("仍有桌面应用在运行，未执行卸载");
      ensureOwned();
      const current = owned;
      command({ action: "uninstall", directory: current });
      if (ownedEntries(inspect()).length) throw Error("测试卸载注册表仍存在");
      verifyProtected();
      owned = null;
    },
    restore() {
      verifyProtected();
      const file = path.join(root, "shortcut-backups.json");
      if (!fs.existsSync(file)) return;
      for (const entry of JSON.parse(fs.readFileSync(file))) {
        fs.mkdirSync(path.dirname(entry.file), { recursive: true });
        fs.copyFileSync(entry.backup, entry.file);
        if (
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(entry.file))
            .digest("hex") !== entry.sha256
        )
          throw Error("原有快捷方式恢复验证失败");
      }
    },
  };
}
module.exports = { installerSession };
