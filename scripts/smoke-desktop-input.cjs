// Real Windows hotkeys, pointer input and native capture; provider traffic is local-only.
const { _electron: electron, chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const { createFixture } = require("../tests/fixture.cjs");
const catalog = require("../config/providers.json");
const root = path.resolve(__dirname, "..");

function input(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(root, ".runtime/Scripts/python.exe"),
      [path.join(root, "tests/windows-input.py"), ...args], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    child.stderr.on("data", (data) => { error += data; });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(error || "Windows input failed")));
  });
}

(async () => {
  if (process.platform !== "win32") throw new Error("此验收需要 Windows 本机运行");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-input-"));
  const env = { ...process.env, SNAP_DATA_DIR: path.join(directory, "app"), SNAP_LEGACY_DIR: path.join(directory, "no-legacy") };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const provider of catalog.providers) env[provider.envKey] = "";
  let fixture, app, browser, originalCursor, desktop, phone;
  try {
    fixture = await createFixture(path.join(directory, "provider"));
    app = await electron.launch({
      ...(process.env.SNAP_TEST_EXECUTABLE ? { executablePath: process.env.SNAP_TEST_EXECUTABLE, args: [] } : { args: [root] }), env,
    });
    desktop = await app.firstWindow();
    await expect.poll(async () => {
      const state = await desktop.evaluate(() => window.snap.state());
      if (state.error) throw new Error(state.error);
      return state.ready;
    }, { timeout: 120000 }).toBe(true);
    const initial = await desktop.evaluate(() => window.snap.state());
    expect(initial.capture.settings.holdMs).toBe(1200);
    expect(initial.capture.settings.timeoutMs).toBe(5000);
    expect(initial.capture.settings.showCaptureHints).toBe(false);
    const settings = {
      ...initial.capture.settings,
      fullShortcut: "Ctrl+Alt+F8", regionShortcut: "Ctrl+Alt+F9",
      prompt: "请识别本机截图中的数学题，并逐步给出答案。",
    };
    await desktop.locator(".capture-settings summary").click();
    await expect(desktop.locator("#setting-show-hints")).toHaveCount(0);
    await desktop.locator("#test").click();
    await expect(desktop.locator("#test")).toBeEnabled();
    await expect(desktop.locator("#notice")).toBeEmpty();
    await desktop.locator("#setting-full").press("Control+Alt+F8");
    await desktop.locator("#setting-region").press("Control+Alt+F9");
    await desktop.locator("#setting-prompt").fill(settings.prompt);
    await desktop.locator("#save-capture-settings").click();
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.settings.fullShortcut).toBe(settings.fullShortcut);
    await desktop.locator(".capture-settings summary").click();
    await desktop.locator("main").evaluate((element) => { element.scrollTop = 0; });
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.mouseReady).toBe(true);
    await app.evaluate(({ BrowserWindow, Notification, Tray }) => {
      const main = BrowserWindow.getAllWindows()[0];
      globalThis.__captureFeedback = { mainId: main.id, mainShows: 0, notifications: 0, notificationsClosed: 0, tooltips: [] };
      main.on("show", () => globalThis.__captureFeedback.mainShows++);
      // Count notification requests without showing OS toasts during acceptance.
      Notification.prototype.show = function () { globalThis.__captureFeedback.notifications++; };
      Notification.prototype.close = function () { globalThis.__captureFeedback.notificationsClosed++; };
      const tooltip = Tray.prototype.setToolTip;
      Tray.prototype.setToolTip = function (text) {
        globalThis.__captureFeedback.tooltips.push(text);
        return tooltip.call(this, text);
      };
    });

    const url = new URL(initial.baseUrl);
    url.hostname = "127.0.0.1";
    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
    const headers = { "X-Snap-Client": "mobile" };
    expect((await context.request.post(url.origin + "/snap/api/pair", {
      headers, data: { credential: new URLSearchParams(new URL(initial.pairingUrl).hash.slice(1)).get("token"), name: "本机验收手机" },
    })).ok()).toBe(true);
    expect((await context.request.post(url.origin + "/snap/api/providers/alibaba", {
      headers, data: { apiKey: "test-only-never-real", baseUrl: fixture.providerUrl },
    })).ok()).toBe(true);
    phone = await context.newPage();
    await phone.goto(url.origin);
    await expect(phone.locator("#chat-input")).toBeVisible({ timeout: 60000 });
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.receiver.ready, { timeout: 15000 }).toBe(true);

    const board = await app.evaluate(async ({ BrowserWindow, screen }, targetFile) => {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const board = new BrowserWindow({ ...display.bounds, frame: false, alwaysOnTop: true, webPreferences: { sandbox: true, nodeIntegration: false } });
      await board.loadFile(targetFile);
      board.show();
      return { cursor: screen.dipToScreenPoint(cursor), bounds: display.bounds, scale: display.scaleFactor };
    }, path.join(root, "tests/capture-target.html"));
    originalCursor = board.cursor;
    const point = async (dx, dy) => app.evaluate(({ screen }, p) => screen.dipToScreenPoint(p), {
      x: board.bounds.x + dx, y: board.bounds.y + dy,
    });
    const first = await point(160, 140), second = await point(640, 460);
    await input(["move", "--x", String(first.x), "--y", String(first.y)]);

    await input(["key", "--key", settings.fullShortcut]);
    await expect.poll(() => fixture.requests.length, { timeout: 30000 }).toBe(1);
    await expect(phone.getByRole("button", { name: "停止", exact: true })).toHaveCount(0, { timeout: 30000 });
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.receiver.ready).toBe(true);
    expect(JSON.stringify(fixture.requests[0].messages)).toContain(settings.prompt);
    await expect(phone.locator("#snap-toast")).toBeHidden();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.fromId(globalThis.__captureFeedback.mainId).isVisible())).toBe(false);

    await input(["hold", "--x", String(first.x), "--y", String(first.y)]);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.phase).toBe("second");
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((window) => window.getTitle() === "选择截图区域").length)).toBe(0);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.phase, { timeout: 7000 }).toBe("idle");
    expect(fixture.requests.length).toBe(1);

    await input(["key", "--key", settings.regionShortcut]);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.phase).toBe("first");
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((window) => window.getTitle() === "选择截图区域").length)).toBe(0);
    await input(["key", "--key", "Escape"]);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.phase).toBe("idle");
    expect(fixture.requests.length).toBe(1);

    await input(["hold", "--x", String(first.x), "--y", String(first.y)]);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.phase).toBe("second");
    await input(["hold", "--x", String(second.x), "--y", String(second.y)]);
    await expect.poll(() => fixture.requests.length, { timeout: 30000 }).toBe(2);
    await expect(phone.getByRole("button", { name: "停止", exact: true })).toHaveCount(0, { timeout: 30000 });
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.busy).toBe(false);
    const parts = fixture.requests[1].messages.at(-1).content;
    expect(parts.filter((part) => part.type === "image_url")).toHaveLength(1);
    const image = parts.find((part) => part.type === "image_url").image_url.url;
    const dimensions = await phone.evaluate(async (src) => {
      const image = new Image(); image.src = src; await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, image);
    expect(Math.abs(dimensions.width - 480 * board.scale)).toBeLessThanOrEqual(1);
    expect(Math.abs(dimensions.height - 320 * board.scale)).toBeLessThanOrEqual(1);

    await phone.locator("#chat-input").fill("保留这份手机草稿");
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.receiver.ready).toBe(false);
    const draftError = await desktop.evaluate(async () => {
      try { await window.snap.captureAndSend(); return ""; } catch (error) { return error.message; }
    });
    expect(draftError).toContain("草稿");
    await expect(phone.locator("#chat-input")).toContainText("保留这份手机草稿");
    expect(fixture.requests.length).toBe(2);
    await input(["key", "--key", settings.fullShortcut]);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.error).toBe(true);
    const silentFeedback = await app.evaluate(({ BrowserWindow }) => ({
      shows: globalThis.__captureFeedback.mainShows,
      notifications: globalThis.__captureFeedback.notifications,
      captureTooltips: globalThis.__captureFeedback.tooltips.filter((text) => text !== "Scrylet · 手机连接服务").length,
      overlays: BrowserWindow.getAllWindows().filter((window) => window.getTitle() === "选择截图区域").length,
    }));
    expect(silentFeedback).toEqual({ shows: 0, notifications: 0, captureTooltips: 0, overlays: 0 });
    await expect(phone.locator("#snap-toast")).toBeHidden();
    await phone.locator("#chat-input").press("Control+A");
    await phone.locator("#chat-input").press("Backspace");
    await expect(phone.locator("#chat-input")).toHaveText("");
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.receiver.ready).toBe(true);

    // Old opt-ins remain ineffective even when submitted through the IPC API.
    const beforeLegacyUpdate = await desktop.evaluate(() => window.snap.state());
    const normalized = await desktop.evaluate((settings) => window.snap.saveCaptureSettings({ ...settings, showCaptureHints: true }), beforeLegacyUpdate.capture.settings);
    expect(normalized.settings.showCaptureHints).toBe(false);
    await expect(desktop.locator("#capture-notice")).toBeHidden();
    await expect(desktop.locator("#capture-target")).toBeHidden();
    await expect(desktop.locator("#notice")).toBeEmpty();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.fromId(globalThis.__captureFeedback.mainId).webContents.isAudioMuted())).toBe(true);

    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) if (window.getTitle() === "Scrylet 截图测试画板") window.destroy();
      BrowserWindow.getAllWindows()[0].show();
    });
    await expect(desktop.locator("#capture-send")).toBeEnabled();
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await desktop.screenshot({ path: path.join(root, "artifacts/desktop-input.png"), scale: "css" });
    await desktop.locator(".capture-settings summary").click();
    await desktop.locator("#setting-prompt").scrollIntoViewIfNeeded();
    await desktop.screenshot({ path: path.join(root, "artifacts/desktop-input-settings.png"), scale: "css" });
    await phone.screenshot({ path: path.join(root, "artifacts/desktop-input-answer.png") });
    const report = {
      at: new Date().toISOString(), platform: process.platform,
      nativeHotkey: true, nativeLongPress: true, timeoutReset: true, escapeCancel: true,
      draftPreserved: true, mockedModelRequests: fixture.requests.length,
      region: dimensions, scaleFactor: board.scale, externalModelRequests: 0,
      settingsPersisted: JSON.parse(fs.readFileSync(path.join(env.SNAP_DATA_DIR, "capture-settings.json"))).fullShortcut === settings.fullShortcut,
      silentCaptureFeedback: silentFeedback,
      legacyHintOptInIgnored: true, desktopAudioMuted: true,
      silentSettingPersisted: JSON.parse(fs.readFileSync(path.join(env.SNAP_DATA_DIR, "capture-settings.json"))).showCaptureHints === false,
    };
    fs.writeFileSync(path.join(root, "artifacts/desktop-input-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } catch (error) {
    const failure = path.join(root, ".test-data", "native-input-failure-" + Date.now());
    fs.mkdirSync(failure, { recursive: true });
    if (desktop) {
      const state = await desktop.evaluate(() => window.snap.state()).catch(() => null);
      const summary = state ? { ready: state.ready, error: state.error, capture: state.capture } : {};
      fs.writeFileSync(path.join(failure, "state.json"), JSON.stringify(summary, null, 2));
      console.error(JSON.stringify({ failure, receiver: summary.capture?.receiver, message: summary.capture?.message }));
      await desktop.screenshot({ path: path.join(failure, "desktop.png") }).catch(() => {});
    }
    if (phone) {
      await phone.screenshot({ path: path.join(failure, "phone.png") }).catch(() => {});
      const editor = await phone.locator("#chat-input").textContent().catch(() => null);
      console.error(JSON.stringify({ draftLength: editor?.length }));
    }
    throw error;
  } finally {
    if (originalCursor) await input(["move", "--x", String(originalCursor.x), "--y", String(originalCursor.y)]).catch(() => {});
    await browser?.close();
    if (app) {
      await app.evaluate(({ app }) => app.quit()).catch(() => {});
      await app.close();
    }
    await fixture?.stop();
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
