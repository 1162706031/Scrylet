// Run on the target Mac. Never replaces /Applications or deletes real userData.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  assert = require("node:assert/strict"),
  crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { _electron, chromium, expect } = require("@playwright/test");
const { protocolProvider } = require("../tests/fixtures/protocol-provider.cjs");
const { run: audit } = require("./audit-package.cjs");
const { digest } = require("./package-audit.cjs");
const { signing } = require("./dist-mac.cjs");
const root = path.resolve(__dirname, "..");
function parse(argv) {
  const value = {};
  for (let i = 0; i < argv.length; i++) {
    const key = {
      "--arch": "arch",
      "--dmg": "dmg",
      "--zip": "zip",
      "--previous-app": "previous",
      "--legacy-source": "legacy",
    }[argv[i]];
    if (!key || !argv[i + 1]) throw Error("MAC_ACCEPTANCE_ARGUMENTS");
    value[key] = argv[++i];
  }
  if (!["x64", "arm64"].includes(value.arch) || !value.dmg || !value.zip)
    throw Error("需要 --arch arm64|x64 --dmg 文件 --zip 文件");
  for (const key of ["dmg", "zip", "previous", "legacy"])
    if (value[key]) value[key] = path.resolve(value[key]);
  return value;
}
function command(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: "utf8", ...options });
  if (result.error || result.status !== 0)
    throw Error("MAC_ACCEPTANCE_STEP_FAILED: " + path.basename(file));
  return result.stdout;
}
async function main(argv = process.argv.slice(2)) {
  const options = parse(argv);
  if (process.platform !== "darwin")
    throw Error("需要真实目标架构 macOS；未执行安装、权限或 Keychain 验收");
  if (
    options.legacy &&
    (!fs
      .realpathSync(options.legacy)
      .startsWith(fs.realpathSync(path.join(root, ".test-data")) + path.sep) ||
      !fs.existsSync(path.join(options.legacy, "synthetic-only.json")))
  )
    throw Error(
      "安装验收只接收 .test-data 中带 synthetic-only 标记的旧数据；未读取真实用户库",
    );
  const arm =
      spawnSync("/usr/sbin/sysctl", ["-n", "hw.optional.arm64"], {
        encoding: "utf8",
      }).stdout?.trim() === "1",
    hardware = arm ? "arm64" : "x64";
  if (hardware !== options.arch || process.arch !== options.arch)
    throw Error("不把 Rosetta / 交叉产物运行计作目标架构通过");
  const running = spawnSync("/usr/bin/pgrep", ["-x", "Scrylet"], {
    encoding: "utf8",
  });
  if (running.stdout.trim()) throw Error("已有 Scrylet 在运行；未替换或停止它");
  const directory = fs.mkdtempSync(
      path.join(root, ".test-data/mac-" + options.arch + "-"),
    ),
    data = path.join(directory, "隔离用户数据"),
    mount = path.join(directory, "mount"),
    installed = path.join(directory, "Applications/Scrylet.app");
  fs.mkdirSync(path.dirname(installed), { recursive: true });
  fs.mkdirSync(mount);
  fs.mkdirSync(data);
  const report = {
    status: "running",
    platform: "darwin",
    arch: options.arch,
    hardware,
    physicalPhone: "unverified",
    finderDragGesture: "unverified",
    oldDatabaseMigration: "M4 unverified",
    actualPermission: null,
    checks: [],
    artifacts: [options.dmg, options.zip].map((file) => ({
      name: path.basename(file),
      bytes: fs.statSync(file).size,
      sha256: digest(file),
    })),
  };
  let app,
    browser,
    mock,
    context,
    mounted = false;
  const secret = crypto.randomBytes(24).toString("hex");
  const env = {
    ...process.env,
    SNAP_RUNTIME_ENGINE: "node",
    SNAP_DATA_DIR: data,
    SNAP_LEGACY_DIR: path.join(directory, "no-legacy"),
    PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
  };
  for (const key of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "NODE_PATH"])
    delete env[key];
  for (const provider of require("../config/providers.json").providers)
    delete env[provider.envKey];
  async function launch() {
    const executable = command("/usr/bin/plutil", [
      "-extract",
      "CFBundleExecutable",
      "raw",
      "-o",
      "-",
      path.join(installed, "Contents/Info.plist"),
    ]).trim();
    if (!executable || /[\\/\0]/.test(executable))
      throw Error("MAC_EXECUTABLE_INVALID");
    app = await _electron.launch({
      executablePath: path.join(installed, "Contents/MacOS", executable),
      args: [],
      env,
      cwd: directory,
      timeout: 30000,
    });
    let page;
    await expect
      .poll(
        async () => {
          page = app
            .windows()
            .find((p) => /\/desktop\/ui\/index\.html$/.test(p.url()));
          if (!page) return false;
          const s = await page.evaluate(() => window.snap.state());
          if (s.error) throw Error("INSTALLED_RUNTIME_FAILED");
          return s.ready;
        },
        { timeout: 120000 },
      )
      .toBe(true);
    assert.equal(await app.evaluate(() => process.arch), options.arch);
    return page;
  }
  async function close() {
    if (app) {
      await app.evaluate(({ app }) => app.quit()).catch(() => {});
      await app.close();
      app = null;
    }
  }
  const safePath = (file) => {
    assert.ok(file.startsWith(directory + path.sep));
    return file;
  };
  try {
    command("/usr/bin/hdiutil", [
      "attach",
      options.dmg,
      "-readonly",
      "-nobrowse",
      "-mountpoint",
      mount,
    ]);
    mounted = true;
    assert.equal(
      fs.readlinkSync(path.join(mount, "Applications")),
      "/Applications",
    );
    const source = path.join(mount, "Scrylet.app");
    assert.ok(fs.existsSync(source));
    report.audit = audit([
      source,
      "--platform",
      "darwin",
      "--arch",
      options.arch,
      "--runtime",
      "node",
    ]);
    const zip = path.join(directory, "zip");
    fs.mkdirSync(zip);
    command("/usr/bin/ditto", ["-x", "-k", options.zip, zip]);
    report.zipAudit = audit([
      path.join(zip, "Scrylet.app"),
      "--platform",
      "darwin",
      "--arch",
      options.arch,
      "--runtime",
      "node",
    ]);
    assert.equal(report.audit.archiveSha256, report.zipAudit.archiveSha256);
    command("/usr/bin/ditto", [options.previous || source, installed]);
    command("/usr/bin/hdiutil", ["detach", mount]);
    mounted = false;
    report.checks.push(
      "DMG-layout-copy-to-isolated-Applications-detach",
      "ZIP-permissions-symlinks-resource-architecture-audit",
    );
    // An optional prior app is read-only. Its actual Keychain access is checked
    // before replacement; missing / incompatible prior apps stay unverified.
    if (options.previous) {
      env.SNAP_DATA_DIR = path.join(directory, "previous-data");
      await launch();
      await app.evaluate(({ safeStorage, app }, value) => {
        if (!safeStorage.isEncryptionAvailable())
          throw Error("KEYCHAIN_UNAVAILABLE");
        process
          .getBuiltinModule("fs")
          .writeFileSync(
            process
              .getBuiltinModule("path")
              .join(app.getPath("userData"), "keychain-probe.bin"),
            safeStorage.encryptString(value),
          );
      }, secret);
      await close();
      fs.copyFileSync(
        path.join(env.SNAP_DATA_DIR, "keychain-probe.bin"),
        path.join(data, "keychain-probe.bin"),
      );
      env.SNAP_DATA_DIR = data;
      report.previousKeychainEncrypted = true;
    }
    fs.rmSync(safePath(installed), { recursive: true, force: true });
    command("/usr/bin/ditto", [path.join(zip, "Scrylet.app"), installed]);
    mock = await protocolProvider();
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    if (options.legacy) env.SNAP_MIGRATION_SOURCE = options.legacy;
    let desktop = await launch();
    let state = await desktop.evaluate(() => window.snap.state());
    report.actualPermission = state.permission;
    const origin = new URL(state.baseUrl);
    origin.hostname = "127.0.0.1";
    const headers = { "X-Snap-Client": "mobile" };
    const pair = await context.request.post(origin.origin + "/snap/api/pair", {
      headers,
      data: {
        credential: new URLSearchParams(
          new URL(state.pairingUrl).hash.slice(1),
        ).get("token"),
        name: "Mac 安装验收",
      },
    });
    assert.ok(pair.ok());
    const call = async (route, body, method = "POST") => {
      const response = await context.request.fetch(origin.origin + route, {
        method,
        headers,
        ...(body ? { data: body } : {}),
      });
      if (!response.ok()) throw Error("INSTALLED_API_FAILED");
      return response.json();
    };
    await call("/snap/api/providers/openai", {
      apiVersion: 1,
      providerId: "openai",
      revision: (await call("/snap/api/providers", null, "GET")).providers.find(
        (p) => p.id === "openai",
      ).revision,
      apiType: "responses",
      baseUrl: mock.baseURL,
      keyAction: "set",
      apiKey: "synthetic-mac-only",
      modelIds: ["fixture-model"],
    });
    const chat = await call("/snap/api/chats", {
      apiVersion: 1,
      modelId: "openai.fixture-model",
      title: "Mac 安装保留",
    });
    const accepted = await call(`/snap/api/chats/${chat.id}/messages`, {
      apiVersion: 1,
      requestId: "mac-installation-round",
      chatVersion: 0,
      parentMessageId: null,
      modelId: chat.modelId,
      origin: "manual",
      parts: [{ type: "text", text: "独立安装验收" }],
    });
    await expect
      .poll(
        async () =>
          (
            await call(
              `/snap/api/generations/${accepted.generationId}`,
              null,
              "GET",
            )
          ).status,
      )
      .toBe("completed");
    await call(
      "/snap/api/drafts/" + chat.id,
      {
        apiVersion: 1,
        browserClientId: "mac-acceptance",
        expectedRevision: 0,
        modelId: chat.modelId,
        parts: [{ type: "text", text: "保存的草稿" }],
      },
      "PUT",
    );
    const saved = await call(`/snap/api/chats/${chat.id}`, null, "GET");
    await app.evaluate(({ safeStorage, app }, value) => {
      const fs = process.getBuiltinModule("fs"),
        file = process
          .getBuiltinModule("path")
          .join(app.getPath("userData"), "keychain-probe.bin");
      if (!safeStorage.isEncryptionAvailable())
        throw Error("KEYCHAIN_UNAVAILABLE");
      if (
        fs.existsSync(file) &&
        safeStorage.decryptString(fs.readFileSync(file)) !== value
      )
        throw Error("OLD_KEYCHAIN_DECRYPT_FAILED");
      fs.writeFileSync(file, safeStorage.encryptString(value));
    }, secret);
    const capture = await desktop.evaluate(async () => {
      try {
        return { ok: true, ...(await window.snap.testCapture()) };
      } catch {
        return { ok: false };
      }
    });
    report.capture = capture;
    if (state.permission !== "granted" || !capture.ok)
      throw Error("SCREEN_PERMISSION_NOT_ACCEPTED");
    const tray = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.close();
      return { visible: w.isVisible(), destroyed: w.isDestroyed() };
    });
    assert.deepEqual(tray, { visible: false, destroyed: false });
    report.checks.push(
      "installed-app-no-development-PATH",
      "real-native-screen-capture-and-close-to-tray",
      "mocked-generation-history-draft-save",
      "Keychain-encrypt-decrypt",
    );
    await close();
    fs.rmSync(safePath(installed), { recursive: true, force: true });
    assert.ok(fs.existsSync(path.join(data, "chat-node/v1/chat.sqlite")));
    command("/usr/bin/ditto", [path.join(zip, "Scrylet.app"), installed]);
    desktop = await launch();
    const later = await desktop.evaluate(() => window.snap.state());
    const laterOrigin = new URL(later.baseUrl);
    laterOrigin.hostname = "127.0.0.1";
    assert.equal(laterOrigin.origin, origin.origin);
    const restored = await call(`/snap/api/chats/${chat.id}`, null, "GET");
    assert.deepEqual(restored.messages, saved.messages);
    assert.equal(
      (
        await call(
          `/snap/api/drafts/${chat.id}?browserClientId=mac-acceptance`,
          null,
          "GET",
        )
      ).parts[0].text,
      "保存的草稿",
    );
    assert.equal(
      await app.evaluate(
        ({ safeStorage, app }, value) =>
          safeStorage.decryptString(
            process
              .getBuiltinModule("fs")
              .readFileSync(
                process
                  .getBuiltinModule("path")
                  .join(app.getPath("userData"), "keychain-probe.bin"),
              ),
          ) === value,
        secret,
      ),
      true,
    );
    // Verify retained model credentials by a new mocked request after reinstall.
    const after = await call(`/snap/api/chats/${chat.id}/messages`, {
      apiVersion: 1,
      requestId: "mac-after-reinstall",
      chatVersion: restored.version,
      parentMessageId: restored.currentMessageId,
      modelId: restored.modelId,
      origin: "manual",
      parts: [{ type: "text", text: "重装后继续" }],
    });
    await expect.poll(() => mock.requests.length).toBe(2);
    await expect
      .poll(
        async () =>
          (
            await call(
              `/snap/api/generations/${after.generationId}`,
              null,
              "GET",
            )
          ).status,
      )
      .toBe("completed");
    report.checks.push(
      "app-replacement-uninstall-reinstall-keeps-history-draft-pairing-and-Keychain",
    );
    if (options.legacy) {
      report.legacyMigration = JSON.parse(
        fs.readFileSync(path.join(data, "chat-node/v1/migration.json"), "utf8"),
      );
      // Use the real composer so rollback receives a confirmed browser draft,
      // rather than manufacturing legacy sessionStorage in the acceptance tool.
      const phone = await context.newPage();
      await phone.goto(origin.origin + "/c/" + chat.id);
      await phone.evaluate(() =>
        localStorage.setItem("snap.browserClientId", "mac-acceptance"),
      );
      await phone.reload();
      await expect(phone.locator("#chat-input")).toHaveValue("保存的草稿");
      await phone.locator("#chat-input").fill("Mac 新版已保存的回退草稿");
      const rollbackImage = require("../tests/fixtures/legacy-v1/database.json").attachments[0];
      await phone
        .getByLabel("选择图片")
        .setInputFiles({
          name: "回退图片.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from(rollbackImage.base64, "base64"),
        });
      await expect(phone.getByText("已保存", { exact: true })).toBeVisible();
      await expect
        .poll(() =>
          phone.evaluate(
            (key) =>
              JSON.parse(sessionStorage.getItem("chat-input-" + key) || "{}")
                .prompt,
            chat.id,
          ),
        )
        .toBe("Mac 新版已保存的回退草稿");
      await expect
        .poll(() =>
          phone.evaluate(
            (key) =>
              JSON.parse(sessionStorage.getItem("chat-input-" + key) || "{}")
                .files?.length,
            chat.id,
          ),
        )
        .toBe(1);
      await close();
      const rollback = path.join(directory, "legacy-rollback");
      const exported = spawnSync(
        path.join(installed, "Contents/MacOS/Scrylet"),
        ["--scrylet-export-legacy", rollback],
        { env, cwd: directory, encoding: "utf8" },
      );
      if (exported.error || exported.status !== 0)
        throw Error("INSTALLED_ROLLBACK_EXPORT_FAILED");
      report.rollback = JSON.parse(
        fs.readFileSync(path.join(rollback, "rollback.json"), "utf8"),
      );
      assert.equal(report.rollback.status, "rollback-validated");
      report.checks.push(
        "synthetic-legacy-migration-and-installed-export-after-new-data",
      );
      report.legacyAppReadback =
        "unverified: requires a compatible pinned legacy Mac app; Node snapshot / DB validation is not old-app acceptance";
      if (options.previous) {
        report.signing = signing(installed);
        fs.rmSync(safePath(installed), { recursive: true, force: true });
        command("/usr/bin/ditto", [options.previous, installed]);
        env.SNAP_DATA_DIR = rollback;
        env.SNAP_RUNTIME_ENGINE = "legacy";
        delete env.SNAP_MIGRATION_SOURCE;
        const oldDesktop = await launch();
        const oldState = await oldDesktop.evaluate(() => window.snap.state());
        const oldOrigin = new URL(oldState.baseUrl);
        oldOrigin.hostname = "127.0.0.1";
        assert.equal(oldOrigin.origin, origin.origin);
        const oldResponse = await context.request.get(
          oldOrigin.origin + "/api/v1/chats/" + chat.id,
          { headers },
        );
        assert.ok(oldResponse.ok());
        const oldChat = (await oldResponse.json()).chat;
        assert.ok(Object.keys(oldChat.history.messages).length >= 4);
        assert.ok(
          Object.values(oldChat.history.messages).some(
            (message) => message.content === "重装后继续",
          ),
        );
        await phone.reload();
        await expect(phone.locator("#chat-input")).toHaveText(
          "Mac 新版已保存的回退草稿",
        );
        await expect(phone.locator(".snap-attachment")).toHaveCount(1);
        await close();
        report.legacyAppReadback =
          "passed: actual pinned legacy app reads new history and confirmed text/image draft";
        report.oldDatabaseMigration = "validated with actual old-app readback";
        report.checks.push(
          "actual-old-Mac-app-reads-new-history-and-browser-image-draft-after-rollback",
        );
      }
    }
    report.signing ||= signing(installed);
    report.status = "partial";
    report.unverified = [
      "physical phone / actual LAN",
      "Finder drag gesture",
      "permission denial then grant",
      "Mac legacy full migration and actual pinned old-app readback after new data (M4)",
      "full global-hotkey / tray-menu / silent-audio / speech acceptance",
      "older app upgrade without --previous-app",
    ].filter(
      (s) =>
        !(options.previous && s.startsWith("older app")) &&
        !(
          options.previous &&
          options.legacy &&
          s.startsWith("Mac legacy full migration")
        ),
    );
  } catch (error) {
    report.status = "failed";
    report.code = error.message;
    throw error;
  } finally {
    await close();
    await browser?.close();
    await mock?.stop();
    if (mounted)
      spawnSync("/usr/bin/hdiutil", ["detach", mount], { stdio: "ignore" });
    fs.writeFileSync(
      path.join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({ ...report, evidence: path.relative(root, directory) }),
    );
  }
  return report;
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main, parse };
