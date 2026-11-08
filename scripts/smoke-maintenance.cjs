const { openDesktopSection } = require("./desktop-ui-navigation.cjs");
// Source or installed-client acceptance. No real model credentials or requests.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const path = require("node:path");
const catalog = require("../config/providers.json");
const { defaults } = require("../desktop/capture-settings.cjs");
const { runtimePaths } = require("../desktop/runtime-paths.cjs");
const root = path.resolve(__dirname, "..");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-maintenance-app-"));
  const env = { ...process.env, SNAP_RUNTIME_ENGINE: "node", SNAP_DATA_DIR: directory, SNAP_LEGACY_DIR: path.join(directory, "no-legacy") };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SNAP_PYTHON;
  for (const provider of catalog.providers) env[provider.envKey] = "";
  const executablePath = process.env.SNAP_TEST_EXECUTABLE;
  if (executablePath && process.platform === "win32") {
    for (const key of Object.keys(env)) if (/^path$/i.test(key)) env[key] = process.env.SystemRoot + "\\System32;" + process.env.SystemRoot;
    env.PYTHONHOME = path.join(directory, "nonexistent-python-home");
    env.PYTHONPATH = path.join(directory, "nonexistent-python-packages");
  }
  const settings = { ...defaults(env.SNAP_LEGACY_DIR), mouseEnabled: false, fullShortcut: "Ctrl+Alt+F10", regionShortcut: "Ctrl+Alt+F11", prompt: "test-private-prompt-never-record" };
  const settingsFile = path.join(directory, "capture-settings.json");
  const settingsText = JSON.stringify(settings);
  fs.writeFileSync(settingsFile, settingsText);
  const upload = path.join(directory, "chat-node/v1/files/preserved-attachment.txt");
  fs.mkdirSync(path.dirname(upload), { recursive: true });
  fs.writeFileSync(upload, "test-preserved-attachment");
  const server = http.createServer((request, response) => {
    response.setHeader("Cache-Control", "public, max-age=31536000");
    if (request.url === "/payload.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end('window.cachedPayload = "' + "x".repeat(512 * 1024) + '";');
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end('<!doctype html><title>Local cache acceptance</title><script src="/payload.js"></script>');
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cacheUrl = "http://127.0.0.1:" + server.address().port;
  let app, page;
  const launch = async () => {
    const instance = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env });
    const window = await instance.firstWindow();
    await expect.poll(async () => {
      const state = await window.evaluate(() => window.snap.state());
      if (state.error) throw new Error(state.error);
      return state.ready;
    }, { timeout: 120000 }).toBe(true);
    return [instance, window];
  };
  try {
    [app, page] = await launch();
    const application = await app.evaluate(({ app }) => ({
      packaged: app.isPackaged, root: app.getAppPath(), executable: app.getPath("exe"),
    }));
    const resourcesPath = path.join(path.dirname(application.executable), "resources");
    const paths = runtimePaths({ root: application.root, resourcesPath, pythonOverride: "" });
    const runtime = { packaged: application.packaged, bundled: paths.packaged && paths.service.startsWith(resourcesPath) };
    if (executablePath) expect(runtime).toEqual({ packaged: true, bundled: true });
    await app.evaluate(async ({ BrowserWindow }, url) => {
      const session = BrowserWindow.getAllWindows()[0].webContents.session;
      await session.cookies.set({ url, name: "cache-preserve", value: "test-cookie-keep", sameSite: "lax" });
      const warm = new BrowserWindow({ show: false, webPreferences: { session, sandbox: true, nodeIntegration: false } });
      await warm.loadURL(url);
      warm.destroy();
    }, cacheUrl);
    await page.evaluate(() => localStorage.setItem("cache-preserve", "test-local-storage-keep"));
    await expect.poll(async () => (await page.evaluate(() => window.snap.cacheInfo())).bytes, { timeout: 20000 }).toBeGreaterThan(0);
    const before = await page.evaluate(() => window.snap.cacheInfo());
    const capture = await page.evaluate(() => window.snap.testCapture());
    expect(capture.width).toBeGreaterThan(0);
    await page.evaluate(async () => {
      await window.snap.pause(true);
      await window.snap.pause(false);
      try { await window.snap.captureAndSend(); } catch { /* No receiver is paired in this fixture. */ }
    });
    await openDesktopSection(page, "activity");
    await expect(page.locator("#activity-log")).toContainText("聊天服务已就绪");
    await page.locator("#log-level").selectOption("errors");
    await expect(page.locator("#activity-log")).toContainText("本次截图未执行");
    await page.locator("#log-level").selectOption("all");
    await page.locator("#clear-cache").click();
    await expect(page.locator("#maintenance-status")).toContainText("缓存已清理");
    await expect(page.locator("#activity-log")).toContainText("页面与代码缓存已清理");
    const after = await page.evaluate(() => window.snap.cacheInfo());
    expect(after.bytes).toBeLessThan(before.bytes);
    expect(await page.evaluate(() => localStorage.getItem("cache-preserve"))).toBe("test-local-storage-keep");
    const cookie = await app.evaluate(async ({ BrowserWindow }, url) => BrowserWindow.getAllWindows()[0].webContents.session.cookies.get({ url, name: "cache-preserve" }), cacheUrl);
    expect(cookie[0].value).toBe("test-cookie-keep");
    expect(fs.readFileSync(settingsFile, "utf8")).toBe(settingsText);
    expect(fs.readFileSync(upload, "utf8")).toBe("test-preserved-attachment");
    expect(fs.existsSync(path.join(directory, "chat-node/v1/chat.sqlite"))).toBe(true);
    const logFile = path.join(directory, "logs/activity.jsonl");
    expect(fs.readFileSync(logFile, "utf8")).not.toContain(settings.prompt);
    await expect(page.locator("#service-status")).toHaveText("可以连接手机");
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    await page.locator("#maintenance").evaluate((element) => {
      const main = element.closest("main");
      main.scrollTop += element.getBoundingClientRect().top - main.getBoundingClientRect().top - 16;
    });
    await page.screenshot({ path: path.join(root, "artifacts/maintenance" + (executablePath ? "-packaged" : "") + ".png"), scale: "css", mask: [page.locator("#qr"), page.locator("#code"), page.locator("#address")] });
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
    await app.close();
    app = null;
    [app, page] = await launch();
    const logs = await page.evaluate(() => window.snap.activityLog());
    expect(logs.entries.some((entry) => entry.event === "cache.cleared")).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("cache-preserve"))).toBe("test-local-storage-keep");
    const report = {
      at: new Date().toISOString(), platform: process.platform, packaged: runtime.packaged,
      bundledRuntime: runtime.bundled, cacheBefore: before.bytes, cacheAfter: after.bytes,
      cookiesPreserved: true, storagePreserved: true, settingsPreserved: true,
      attachmentsPreserved: true, logsSurviveRestart: true, logRecords: logs.entries.length,
      nativeCapture: capture, externalModelRequests: 0,
    };
    fs.writeFileSync(path.join(root, "artifacts/maintenance" + (executablePath ? "-packaged" : "") + "-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } catch (error) {
    const failure = path.join(root, ".test-data/maintenance-failure-" + Date.now());
    fs.mkdirSync(failure, { recursive: true });
    if (page) await page.screenshot({ path: path.join(failure, "window.png") }).catch(() => {});
    if (fs.existsSync(path.join(directory, "runtime.log"))) fs.copyFileSync(path.join(directory, "runtime.log"), path.join(failure, "runtime.log"));
    console.error("Maintenance failure evidence: " + failure);
    throw error;
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.quit()).catch(() => {});
      await app.close();
    }
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
