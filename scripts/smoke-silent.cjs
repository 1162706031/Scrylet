// Isolated native capture with a local mock provider. Does not synthesize OS
// input, so an already-running user's client cannot react to our test gestures.
const { _electron: electron, chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFixture } = require("../tests/fixture.cjs");
const { defaults } = require("../desktop/capture-settings.cjs");
const root = path.resolve(__dirname, "..");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-strict-silent-"));
  const env = { ...process.env, SNAP_DATA_DIR: path.join(directory, "app"), SNAP_LEGACY_DIR: path.join(directory, "no-legacy") };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SNAP_PYTHON;
  for (const provider of require("../config/providers.json").providers) env[provider.envKey] = "";
  const settings = { ...defaults(env.SNAP_LEGACY_DIR), mouseEnabled: false, showCaptureHints: true,
    fullShortcut: "Ctrl+Alt+F10", regionShortcut: "Ctrl+Alt+F11", prompt: "本地静默截图验收" };
  fs.mkdirSync(env.SNAP_DATA_DIR, { recursive: true });
  const settingsFile = path.join(env.SNAP_DATA_DIR, "capture-settings.json");
  const originalSettings = JSON.stringify(settings);
  fs.writeFileSync(settingsFile, originalSettings);
  let fixture, app, browser, desktop;
  try {
    fixture = await createFixture(path.join(directory, "mock"));
    const executablePath = process.env.SNAP_TEST_EXECUTABLE;
    app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env });
    desktop = await app.firstWindow();
    await expect.poll(async () => {
      const state = await desktop.evaluate(() => window.snap.state());
      if (state.error) throw new Error(state.error);
      return state.ready;
    }, { timeout: 120000 }).toBe(true);
    const application = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion() }));
    expect(application.version).toBe(require("../package.json").version);
    if (executablePath) expect(application.packaged).toBe(true);
    const state = await desktop.evaluate(() => window.snap.state());
    await expect(desktop.locator("#service-status")).toHaveText("可以连接手机");
    expect(state.capture.settings.showCaptureHints).toBe(false);
    expect(fs.readFileSync(settingsFile, "utf8")).toBe(originalSettings);
    await expect(desktop.locator("#setting-show-hints")).toHaveCount(0);
    await desktop.locator(".capture-settings summary").focus();
    await desktop.locator(".capture-settings summary").press("Enter");
    await desktop.locator(".capture-settings").evaluate(element => element.scrollIntoView({ block: "start" }));
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await desktop.screenshot({ path: path.join(root, "artifacts/strict-silent-settings.png"), scale: "css" });

    browser = await chromium.launch();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN", isMobile: true, hasTouch: true });
    const url = new URL(state.baseUrl);
    url.hostname = "127.0.0.1";
    const headers = { "X-Snap-Client": "mobile" };
    expect((await phone.request.post(url.origin + "/snap/api/pair", {
      headers, data: { credential: new URLSearchParams(new URL(state.pairingUrl).hash.slice(1)).get("token"), name: "静默验收手机" },
    })).ok()).toBe(true);
    expect((await phone.request.post(url.origin + "/snap/api/providers/alibaba", {
      headers, data: { apiKey: "test-only-never-real", baseUrl: fixture.providerUrl },
    })).ok()).toBe(true);
    await phone.goto(url.origin);
    await expect(phone.locator("#snap-capture")).toBeEnabled({ timeout: 60000 });
    const completionAudio = await phone.evaluate(async () => {
      const audio = new AudioContext();
      try {
        const results = [];
        for (const cue of ["notification.mp3", "greeting.mp3"]) {
          const response = await fetch("/audio/" + cue);
          const decoded = await audio.decodeAudioData(await response.arrayBuffer());
          let peak = 0;
          for (let channel = 0; channel < decoded.numberOfChannels; channel++)
            for (const sample of decoded.getChannelData(channel)) peak = Math.max(peak, Math.abs(sample));
          results.push({ cue, peak, duration: decoded.duration });
        }
        return results;
      } finally { await audio.close(); }
    });
    for (const cue of completionAudio) expect(cue.peak).toBe(0);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.receiver.ready).toBe(true);
    await app.evaluate(({ BrowserWindow, Notification, Tray, shell }) => {
      const main = BrowserWindow.getAllWindows()[0];
      main.hide();
      globalThis.__silentProbe = { mainId: main.id, shows: 0, focuses: 0, notifications: 0, beeps: 0, flashes: 0, tooltips: 0 };
      main.on("show", () => globalThis.__silentProbe.shows++);
      main.on("focus", () => globalThis.__silentProbe.focuses++);
      Notification.prototype.show = () => { globalThis.__silentProbe.notifications++; };
      shell.beep = () => { globalThis.__silentProbe.beeps++; };
      BrowserWindow.prototype.flashFrame = () => { globalThis.__silentProbe.flashes++; };
      Tray.prototype.setToolTip = () => { globalThis.__silentProbe.tooltips++; };
    });
    const capture = await desktop.evaluate(() => window.snap.captureAndSend());
    expect(capture.width).toBeGreaterThan(0);
    await expect.poll(() => fixture.requests.length).toBe(1);
    await expect(phone.getByRole("button", { name: "停止", exact: true })).toHaveCount(0);
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.receiver.ready).toBe(true);
    await desktop.evaluate(() => window.snap.selectRegion());
    expect((await desktop.evaluate(() => window.snap.state())).capture.phase).toBe("first");
    await desktop.evaluate(() => window.snap.cancelRegion());
    await phone.locator("#chat-input").fill("保留手机草稿");
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).capture.receiver.ready).toBe(false);
    const rejected = await desktop.evaluate(async () => {
      try { await window.snap.captureAndSend(); return false; } catch { return true; }
    });
    expect(rejected).toBe(true);
    expect(fixture.requests.length).toBe(1);
    const normalized = await desktop.evaluate(settings => window.snap.saveCaptureSettings(settings), settings);
    expect(normalized.settings.showCaptureHints).toBe(false);
    await expect(desktop.locator("#notice")).toBeEmpty();
    await expect(desktop.locator("#capture-target")).toBeHidden();
    await expect(desktop.locator("#capture-notice")).toBeHidden();
    await expect(phone.locator("#snap-toast")).toBeHidden();
    const feedback = await app.evaluate(({ BrowserWindow }) => {
      const { mainId, ...counts } = globalThis.__silentProbe;
      const main = BrowserWindow.fromId(mainId);
      return { ...counts, overlays: BrowserWindow.getAllWindows().filter(window => window.getTitle() === "选择截图区域").length,
        mainVisible: main.isVisible(), audioMuted: main.webContents.isAudioMuted() };
    });
    expect(feedback).toEqual({ shows: 0, focuses: 0, notifications: 0, beeps: 0, flashes: 0, tooltips: 0, overlays: 0, mainVisible: false, audioMuted: true });
    const report = { at: new Date().toISOString(), platform: process.platform, ...application,
      nativeCapture: { width: capture.width, height: capture.height },
      feedback, completionAudio, legacyHintsIgnored: true, draftPreserved: true, mockedModelRequests: 1, externalModelRequests: 0, physicalInputSynthesized: false };
    fs.writeFileSync(path.join(root, "artifacts/strict-silent" + (executablePath ? "-packaged" : "") + "-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } catch (error) {
    const failure = path.join(root, ".test-data/strict-silent-failure-" + Date.now());
    fs.mkdirSync(failure, { recursive: true });
    if (desktop) await desktop.screenshot({ path: path.join(failure, "window.png") }).catch(() => {});
    console.error("Silent capture failure evidence: " + failure);
    throw error;
  } finally {
    await browser?.close();
    if (app) { await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close(); }
    await fixture?.stop();
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
