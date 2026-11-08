// Actual NSIS acceptance. Installs/uninstalls only a new owned directory and
// restores pre-existing shortcut bytes; existing user installations are refused.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { _electron, chromium, expect } = require("@playwright/test");
const { installerSession } = require("./windows-install.cjs"),
  { protocolProvider } = require("../tests/fixtures/protocol-provider.cjs"),
  { digest } = require("./package-audit.cjs");
const root = path.resolve(__dirname, "..");
function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--node-default") { o.nodeDefault = true; continue; }
    if (argv[i] === "--isolated-nsis") {
      o.isolated = true;
      continue;
    }
    const key = { "--old-installer": "old", "--new-installer": "next" }[
      argv[i]
    ];
    if (!key || !argv[i + 1])
      throw Error("需要 --old-installer 与 --new-installer");
    o[key] = path.resolve(argv[++i]);
  }
  if (!o.old || !o.next || o.old === o.next)
    throw Error("需要两份独立的实际 NSIS 安装器");
  return o;
}
async function main(argv = process.argv.slice(2)) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("覆盖升级验收需要 Windows x64");
  const options = parse(argv),
    directory = fs.mkdtempSync(
      path.join(root, options.nodeDefault ? ".test-data/node-service-m5/install-" : ".test-data/node-service-m4/install-"),
    ),
    installed = path.join(directory, "中文 有空格.安装", "Scrylet"),
    oldData = path.join(directory, "旧版 数据"),
    newData = path.join(directory, "新版 数据"),
    rollback = path.join(directory, "回退 数据");
  const report = {
    status: "running",
    platform: process.platform,
    arch: process.arch,
    checks: [],
    installerHashes: {
      old: digest(options.old),
      candidate: digest(options.next),
    },
    sameAppId: "com.snapsolver.desktop",
    defaultEngine: "legacy",
    candidateDefaultEngine: options.nodeDefault ? "node" : "explicit node",
    nsisNamespace: options.isolated
      ? "isolated acceptance; production GUID upgrade remains unverified"
      : "production identity",
    externalModelRequests: 0,
    physicalPhone: "unverified",
    directory: path.relative(root, directory),
  };
  let app,
    desktop,
    browser,
    mock,
    session,
    phone,
    context,
    origin,
    chatId,
    newFileId;
  const env = { ...process.env };
  for (const key of [
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "NODE_PATH",
    "SNAP_MIGRATION_SOURCE",
    "SNAP_DATA_DIR",
    "SNAP_RUNTIME_ENGINE",
  ])
    delete env[key];
  for (const provider of require("../config/providers.json").providers)
    delete env[provider.envKey];
  const done = (name) => report.checks.push(name);
  async function close() {
    if (app) {
      await app.evaluate(({ app }) => app.quit()).catch(() => {});
      await app.close().catch(() => {});
      app = null;
    }
  }
  async function launch(executable, data, engine, source) {
    const launchEnv = { ...env, SNAP_DATA_DIR: data, SNAP_LEGACY_DIR: path.join(directory, "no-seeds"), ...(source ? { SNAP_MIGRATION_SOURCE: source } : {}) };
    if (!(options.nodeDefault && engine === "node")) launchEnv.SNAP_RUNTIME_ENGINE = engine;
    app = await _electron.launch({
      executablePath: executable,
      args: [],
      cwd: directory,
      env: launchEnv,
      timeout: 30000,
    });
    await expect
      .poll(
        async () => {
          desktop = app
            .windows()
            .find((p) => /\/desktop\/ui\/index\.html$/.test(p.url()));
          if (!desktop) return false;
          const s = await desktop.evaluate(() => window.snap.state());
          if (s.error) throw Error("INSTALLED_APP_FAILED");
          return s.ready;
        },
        { timeout: 120000 },
      )
      .toBe(true);
    if (options.nodeDefault && engine === "node") {
      const proof = await app.evaluate(({ app }) => { const load = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json"); return { configured: process.env.SNAP_RUNTIME_ENGINE, selected: load("./package.json").scryletRuntimeDefault, legacyLoaded: Object.keys(load.cache).some(p => /legacy-(?:runtime|gateway|paths)\.cjs$/.test(p)) }; });
      assert.equal(proof.configured, undefined); assert.equal(proof.selected, "node"); assert.equal(proof.legacyLoaded, false);
      const archiveHash = digest(await app.evaluate(({ app }) => app.getAppPath()));
      if (report.applicationArchiveSha256) assert.equal(archiveHash, report.applicationArchiveSha256);
      else {
        report.applicationArchiveSha256 = archiveHash;
        report.installedAudit = require("./audit-package.cjs").run([path.dirname(executable), "--platform", "win32", "--arch", "x64", "--runtime", "node"]);
        assert.equal(report.installedAudit.archiveSha256, archiveHash);
      }
    }
    return desktop.evaluate(() => window.snap.state());
  }
  const call = async (
    route,
    body,
    method = body === undefined ? "GET" : "POST",
  ) => {
    const result = await context.request.fetch(origin + route, {
      method,
      headers: { "X-Snap-Client": "mobile" },
      ...(body === undefined ? {} : { data: body }),
    });
    if (!result.ok())
      throw Error("INSTALLED_API_FAILED " + result.status() + " " + route);
    return result.json();
  };
  async function waitGeneration(id) {
    await expect
      .poll(async () => (await call("/snap/api/generations/" + id)).status, {
        timeout: 30000,
      })
      .toBe("completed");
  }
  async function verifySaved() {
    await phone.reload();
    await expect(phone.locator("#chat-input")).toHaveValue(
      "M4 新安装已保存草稿",
    );
    await expect(phone.locator(".attachment")).toHaveCount(1);
    assert.equal(
      (await call("/snap/api/providers")).providers.find(
        (p) => p.id === "openai",
      ).configured,
      false,
    );
    assert.equal(
      await desktop.evaluate(() => localStorage.getItem("m4-cache-sentinel")),
      "preserved",
    );
    const state = await desktop.evaluate(() => window.snap.state());
    assert.equal(state.capture.settings.fullShortcut, "Ctrl+Alt+F8");
    assert.ok(state.networks.some((n) => n.address === state.selectedAddress));
    assert.equal(new URL(state.baseUrl).port, new URL(origin).port);
  }
  async function newRound(label) {
    const c = await call("/snap/api/chats/" + chatId),
      accepted = await call("/snap/api/chats/" + chatId + "/messages", {
        apiVersion: 1,
        requestId: "install-" + label,
        chatVersion: c.version,
        parentMessageId: c.currentMessageId,
        modelId: c.modelId,
        origin: "manual",
        parts: [{ type: "text", text: "隔离安装验收 " + label }],
      });
    await waitGeneration(accepted.generationId);
  }
  try {
    session = installerSession(
      directory,
      {
        ...env,
        SNAP_DATA_DIR: path.join(directory, "installer-autorun-isolated"),
        SNAP_LEGACY_DIR: path.join(directory, "no-seeds"),
      },
      { isolated: options.isolated },
    );
    report.preflight = session.prepare();
    mock = await protocolProvider();
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
    });
    let executable = session.install(options.old, installed);
    let state = await launch(executable, oldData, "legacy");
    const url = new URL(state.baseUrl);
    url.hostname = "127.0.0.1";
    origin = url.origin;
    assert.ok(
      (
        await context.request.post(origin + "/snap/api/pair", {
          headers: { "X-Snap-Client": "mobile" },
          data: {
            credential: new URLSearchParams(
              new URL(state.pairingUrl).hash.slice(1),
            ).get("token"),
            name: "M4 安装验收",
          },
        })
      ).ok(),
    );
    await call("/snap/api/providers/alibaba", {
      apiKey: "synthetic-install-old",
      baseUrl: mock.baseURL,
    });
    await call("/snap/api/providers/openai", {
      apiKey: "synthetic-to-delete",
      baseUrl: mock.baseURL,
    });
    await call("/snap/api/providers/openai", {
      apiKey: "",
      baseUrl: mock.baseURL,
      remove: true,
    });
    const settings = {
      ...state.capture.settings,
      fullShortcut: "Ctrl+Alt+F8",
      mouseEnabled: false,
      prompt: "安装验收提示词",
    };
    await desktop.evaluate((v) => window.snap.saveCaptureSettings(v), settings);
    const preferred =
      state.networks.find((n) => n.address !== "127.0.0.1") ||
      state.networks[0];
    if (preferred)
      await desktop.evaluate(
        (address) => window.snap.selectNetwork(address),
        preferred.address,
      );
    phone = await context.newPage();
    await phone.goto(origin);
    await expect(phone.locator("#chat-input")).toBeVisible({ timeout: 60000 });
    const upload = path.join(directory, "synthetic.png");
    fs.writeFileSync(upload, require("../tests/phone/helpers.cjs").png);
    await phone.locator("#snap-image-picker").setInputFiles(upload);
    await expect(phone.locator(".snap-attachment")).toHaveCount(1);
    await phone.locator("#chat-input").fill("M4 旧安装保存的聊天");
    await phone.locator("#send-message-button").click();
    await expect.poll(() => mock.requests.length).toBe(1);
    await expect(
      phone.getByRole("button", { name: "停止", exact: true }),
    ).toBeHidden();
    await expect(phone).toHaveURL(/\/c\/[A-Za-z0-9_-]+$/);
    chatId = new URL(phone.url()).pathname.split("/").at(-1);
    await phone.locator('button[aria-label="重新生成"]').click();
    await phone.getByRole("button", { name: "重试", exact: true }).click();
    await expect.poll(() => mock.requests.length).toBe(2);
    await expect(
      phone.getByRole("button", { name: "停止", exact: true }),
    ).toBeHidden();
    await phone.locator("#chat-input").fill("M4 旧安装保存的草稿");
    await phone.locator("#snap-image-picker").setInputFiles(upload);
    await expect
      .poll(() =>
        phone.evaluate(
          (key) =>
            JSON.parse(sessionStorage.getItem("chat-input-" + key) || "{}")
              .files?.length,
          chatId,
        ),
      )
      .toBe(1);
    await phone.evaluate(() => {
      localStorage.setItem("snap.readAloud", "false");
      localStorage.setItem("snap.speechVoice", "m4-installed-voice");
      localStorage.setItem("snap.speechRate", "1.1");
    });
    await close();
    report.oldSourceHash = digest(path.join(oldData, "open-webui/webui.db"));
    done(
      "actual-old-NSIS-install-history-branch-saved-draft-key-delete-and-settings",
    );
    assert.equal(digest(options.next), report.installerHashes.candidate, "验收期间候选安装器发生变化，未覆盖");
    executable = session.install(options.next, installed);
    state = await launch(executable, newData, "node", oldData);
    assert.equal(state.capture.settings.fullShortcut, "Ctrl+Alt+F8");
    assert.equal(state.capture.settings.showCaptureHints, false);
    assert.equal(new URL(state.baseUrl).port, new URL(origin).port);
    await phone.reload();
    await expect(phone.locator("#chat-input")).toHaveValue(
      "M4 旧安装保存的草稿",
    );
    await expect(phone.locator(".attachment")).toHaveCount(1);
    assert.equal((await call("/snap/api/status")).migration, "validated");
    assert.equal(
      (await call("/snap/api/providers")).providers.find(
        (p) => p.id === "openai",
      ).configured,
      false,
    );
    done(
      "actual-new-NSIS-overwrite-isolated-migration-same-origin-pairing-network-hotkeys",
    );
    await phone.locator("#chat-input").fill("M4 新安装追加图文消息");
    await phone.locator("#send-message-button").click();
    await expect.poll(() => mock.requests.length).toBe(3);
    await expect(phone.getByRole("button", { name: "停止生成" })).toBeHidden();
    await expect
      .poll(
        async () => (await call("/snap/api/chats/" + chatId)).activeGeneration,
      )
      .toBeNull();
    await phone.locator("#chat-input").fill("M4 新安装已保存草稿");
    await phone.locator("input[type=file]").setInputFiles(upload);
    await expect(phone.locator(".attachment")).toHaveCount(1);
    await expect
      .poll(() =>
        phone.evaluate(
          (key) =>
            JSON.parse(sessionStorage.getItem("chat-input-" + key) || "{}")
              .prompt,
          chatId,
        ),
      )
      .toBe("M4 新安装已保存草稿");
    await desktop.evaluate(() =>
      localStorage.setItem("m4-cache-sentinel", "preserved"),
    );
    const cached = await desktop.evaluate(() => window.snap.clearCache());
    assert.equal(cached.success, true);
    assert.equal(
      await desktop.evaluate(() => localStorage.getItem("m4-cache-sentinel")),
      "preserved",
    );
    assert.ok(fs.existsSync(path.join(newData, "chat-node/v1/chat.sqlite")));
    done("new-round-image-and-confirmed-draft-desktop-cache-clear-keeps-data");
    await desktop.screenshot({
      path: path.join(root, options.nodeDefault ? "artifacts/node-service-m5-installed-desktop.png" : "artifacts/node-service-m4-installed-desktop.png"),
      mask: [
        desktop.locator("#qr"),
        desktop.locator("#code"),
        desktop.locator("#address"),
      ],
    });
    await phone.screenshot({
      path: path.join(root, options.nodeDefault ? "artifacts/node-service-m5-installed-phone.png" : "artifacts/node-service-m4-installed-phone.png"),
    });
    await close();
    await launch(executable, newData, "node");
    await verifySaved();
    await newRound("after-restart");
    done(
      "actual-installed-app-restart-OS-keys-provider-deletion-and-data-readable",
    );
    await close();
    session.uninstall();
    for (const file of [
      "chat-node/v1/chat.sqlite",
      "chat-node/v1/secrets.json",
      "devices.json",
      "network.json",
      "capture-settings.json",
      "Local State",
    ])
      assert.ok(fs.existsSync(path.join(newData, file)));
    done("actual-uninstall-retains-all-isolated-userData-and-OS-key-profile");
    assert.equal(digest(options.next), report.installerHashes.candidate, "验收期间候选安装器发生变化，未重装");
    executable = session.install(options.next, installed);
    await launch(executable, newData, "node");
    await verifySaved();
    await newRound("after-reinstall");
    done(
      "actual-reinstall-pairing-history-draft-key-and-model-request-retained",
    );
    await close();
    const exported = require("./export-legacy.cjs").main([
      "--data",
      newData,
      "--output",
      rollback,
      "--executable",
      executable,
    ]);
    assert.equal(exported.status, "rollback-validated");
    done("installed-app-local-export-protocol-creates-independent-old-data");
    session.uninstall();
    executable = session.install(options.old, installed);
    await launch(executable, rollback, "legacy");
    await phone.reload();
    await expect(phone.locator("#chat-input")).toHaveText(
      "M4 新安装已保存草稿",
      { timeout: 60000 },
    );
    await expect(phone.locator(".snap-attachment")).toHaveCount(1);
    assert.ok((await call("/api/v1/chats/" + chatId)).chat.history.messages);
    await phone.screenshot({
      path: path.join(root, options.nodeDefault ? "artifacts/node-service-m5-installed-rollback.png" : "artifacts/node-service-m4-installed-rollback.png"),
    });
    done(
      "actual-old-installed-app-reads-new-messages-branches-and-browser-draft-after-rollback",
    );
    await close();
    assert.equal(
      digest(path.join(oldData, "open-webui/webui.db")),
      report.oldSourceHash,
    );
    report.modelRequests = mock.requests.length;
    assert.equal(report.modelRequests, 5);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.code = error.message;
    throw error;
  } finally {
    await close();
    await browser?.close();
    await mock?.stop();
    if (session) {
      try {
        session.uninstall();
        report.cleanup = "owned app uninstalled; original shortcuts restored";
      } catch (error) {
        report.cleanup = "failed";
        report.cleanupCode = error.message;
        report.status = "failed";
        process.exitCode = 1;
      } finally {
        try {
          session.restore();
        } catch (error) {
          report.cleanup = "failed";
          report.cleanupCode = error.message;
          report.status = "failed";
          process.exitCode = 1;
        }
      }
    }
    fs.writeFileSync(
      path.join(directory, "report.json"),
      JSON.stringify({ ...report, installationTimings: session?.measurements || [] }, null, 2),
    );
    console.log(JSON.stringify(report));
  }
  return report;
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main, parse };
