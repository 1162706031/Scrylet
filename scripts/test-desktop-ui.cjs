// Real Electron / Node / IPC acceptance. No system input injection or live models.
const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs"), path = require("node:path");
const { defaults } = require("../desktop/capture-settings.cjs");
const { openDesktopSection } = require("./desktop-ui-navigation.cjs");
const root = path.resolve(__dirname, ".."), base = path.join(root, ".test-data/desktop-ui-redesign");
(async () => {
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "app-"));
  const env = { ...process.env, SNAP_DATA_DIR: directory, SNAP_LEGACY_DIR: path.join(directory, "no-legacy") };
  for (const name of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "NODE_PATH", "SNAP_RUNTIME_ENGINE", "SNAP_MIGRATION_SOURCE"]) delete env[name];
  for (const provider of require("../config/providers.json").providers) delete env[provider.envKey];
  fs.writeFileSync(path.join(directory, "capture-settings.json"), JSON.stringify({ ...defaults(env.SNAP_LEGACY_DIR), mouseEnabled: false, fullShortcut: "Ctrl+Alt+F10", regionShortcut: "Ctrl+Alt+F11" }));
  const app = await electron.launch({ args: [root], env, timeout: 30000 });
  let page;
  try {
    page = await app.firstWindow();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await expect.poll(async () => (await page.evaluate(() => window.snap.state())).ready, { timeout: 120000 }).toBe(true);
    await expect(page.locator('[data-view="overview"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#qr-cover")).toBeHidden();
    const screenshot = name => page.screenshot({ path: path.join(root, `artifacts/desktop-redesign-${name}.png`), scale: "css", animations: "disabled", maskColor: "#e3ebdd", mask: [page.locator("#qr"), page.locator("#code"), page.locator("#address")] });
    await screenshot("overview");
    await openDesktopSection(page, "models");
    await expect(page.locator(".provider-option")).toHaveCount(6);
    await page.locator('.provider-option[data-id="openai"]').click();
    await expect(page.locator("#api-key")).toHaveAttribute("type", "password");
    await expect(page.locator("#api-key")).toHaveValue("");
    await screenshot("models");
    await page.locator(".provider-advanced summary").click();
    await expect(page.locator("#model-list")).not.toBeEmpty();
    await page.locator("#base-url").fill("https://api.example.invalid/v1");
    await page.locator("#api-key").fill("synthetic-desktop-ui-only");
    await page.locator("#save-provider").click();
    await expect(page.locator('.provider-option[data-id="openai"]')).toContainText("密钥已存");
    await expect(page.locator("#api-key")).toHaveValue("");
    expect((await page.evaluate(() => window.snap.providers())).providers.find(p => p.id === "openai").baseUrl).toBe("https://api.example.invalid/v1");
    await page.locator("#save-provider").click();
    await expect(page.locator('.provider-option[data-id="openai"]')).toContainText("密钥已存");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#remove-provider").click();
    await expect(page.locator('.provider-option[data-id="openai"]')).toContainText("添加密钥");
    await expect(page.locator("#api-key")).toHaveValue("");
    await openDesktopSection(page, "capture");
    await expect(page.locator("#capture-panel")).toBeVisible();
    await expect(page.locator("#overview-panel")).toBeHidden();
    const prompt = "用清晰的步骤解释截图里的问题。";
    await page.locator("#setting-prompt").fill(prompt);
    await openDesktopSection(page, "activity");
    await expect(page.locator("#activity-log")).toContainText("聊天服务已就绪");
    await openDesktopSection(page, "capture");
    await expect(page.locator("#setting-prompt")).toHaveValue(prompt);
    await page.locator("#setting-full").press("Control+Alt+F8");
    await page.locator("#save-capture-settings").click();
    await expect.poll(async () => (await page.evaluate(() => window.snap.state())).capture.settings.prompt).toBe(prompt);
    await expect(page.locator("#full-shortcut")).toHaveText("Ctrl+Alt+F8");
    const settings = JSON.parse(fs.readFileSync(path.join(directory, "capture-settings.json"), "utf8"));
    expect(settings.prompt).toBe(prompt); expect(settings.showCaptureHints).toBe(false);
    await page.locator("main").evaluate(node => { node.scrollTop = 0; });
    await screenshot("capture");
    await page.evaluate(async () => { try { await window.snap.captureAndSend(); } catch { /* No paired receiver: log only. */ } });
    await openDesktopSection(page, "activity");
    await page.locator("#refresh-logs").click();
    await page.locator("#log-level").selectOption("errors");
    await expect(page.locator("#activity-log")).toContainText("本次截图未执行");
    await page.locator("#log-level").selectOption("all");
    await page.evaluate(() => localStorage.setItem("ui-cache-preserve", "keep"));
    await page.locator("#clear-cache").click();
    await expect(page.locator("#maintenance-status")).toContainText("缓存已清理");
    expect(await page.evaluate(() => localStorage.getItem("ui-cache-preserve"))).toBe("keep");
    expect(JSON.parse(fs.readFileSync(path.join(directory, "capture-settings.json"), "utf8"))).toEqual(settings);
    await page.locator("main").evaluate(node => { node.scrollTop = 0; });
    await screenshot("activity");
    await openDesktopSection(page, "network");
    await expect(page.locator("#networks")).toBeVisible();
    const state = await page.evaluate(() => window.snap.state());
    await page.locator("#networks").selectOption(state.selectedAddress);
    await expect(page.locator("#address")).toHaveText(state.baseUrl);
    await screenshot("network");
    for (const size of [{ width: 780, height: 700 }, { width: 860, height: 740 }, { width: 1100, height: 820 }]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size.width, size.height), size);
      await expect(async () => {
        const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }));
        expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width);
        for (const selector of [".desktop-nav", "#capture-send", "#capture-region", "#test", "footer"]) {
          const box = await page.locator(selector).boundingBox(); expect(box, selector).not.toBeNull();
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
        }
      }).toPass({ timeout: 5000 });
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(860, 740));
    await page.locator("#pause").click();
    await expect(page.locator("#service-status")).toHaveText("手机访问已暂停");
    await openDesktopSection(page, "overview"); await expect(page.locator("#qr-cover")).toBeVisible();
    await page.locator("#pause").click(); await expect(page.locator("#qr-cover")).toBeHidden();
    expect(errors).toEqual([]);
    const report = { date: "2026-11-09", platform: process.platform, arch: process.arch, status: "passed", realElectron: true, realNodeService: true, isolatedData: true, navigation: true, keyboardNavigation: true, draftPreservedAcrossViews: true, settingsPersisted: true, logFiltering: true, realCacheCleanup: true, localStorageAndSettingsPreserved: true, pauseResume: true, windowSizes: ["780x700", "860x740", "1100x820"], pageErrors: errors, externalModelRequests: 0, nativeCaptureTested: false, packagedTested: false };
    fs.writeFileSync(path.join(root, "artifacts/desktop-redesign-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("Desktop UI acceptance passed: navigation, settings, logs, cache, network, pause/resume and window sizes.");
  } catch (error) {
    await page?.screenshot({ path: path.join(base, "failure.png"), mask: [page.locator("#qr"), page.locator("#code"), page.locator("#address")] }).catch(() => {});
    throw error;
  } finally {
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
    await app.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
