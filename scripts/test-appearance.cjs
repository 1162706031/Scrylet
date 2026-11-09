// Real desktop IPC + Node gateway + Chromium/WebKit, loopback models only.
const { _electron, chromium, webkit, expect } = require("@playwright/test");
const fs = require("node:fs"), path = require("node:path");
const { defaults } = require("../desktop/capture-settings.cjs");
const { protocolProvider } = require("../tests/fixtures/protocol-provider.cjs");
const catalog = require("../config/appearance.json");
const root = path.resolve(__dirname, ".."), base = path.join(root, ".test-data/appearance");
(async () => {
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "app-"));
  const env = { ...process.env, SNAP_DATA_DIR: directory, SNAP_LEGACY_DIR: path.join(directory, "no-legacy") };
  for (const name of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "NODE_PATH", "SNAP_RUNTIME_ENGINE", "SNAP_MIGRATION_SOURCE"]) delete env[name];
  for (const provider of require("../config/providers.json").providers) delete env[provider.envKey];
  fs.writeFileSync(path.join(directory, "capture-settings.json"), JSON.stringify({ ...defaults(env.SNAP_LEGACY_DIR), mouseEnabled: false, fullShortcut: "Ctrl+Alt+F10", regionShortcut: "Ctrl+Alt+F11" }));
  let app, desktop, mock;
  const browsers = [], phones = [], errors = [];
  async function launch() {
    app = await _electron.launch({ args: [root], env, timeout: 30000 });
    desktop = await app.firstWindow(); desktop.on("pageerror", error => errors.push(error.message));
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).ready, { timeout: 120000 }).toBe(true);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1040, 820));
  }
  async function stop() {
    if (!app) return;
    await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close(); app = null;
  }
  async function themed(page, id) {
    await expect(page.locator("html")).toHaveAttribute("data-theme", id, { timeout: 8000 });
  }
  async function choose(id) {
    await desktop.locator(`[data-theme-choice="${id}"]`).click();
    await themed(desktop, id);
    await expect(desktop.locator(`[data-theme-choice="${id}"]`)).toHaveAttribute("aria-pressed", "true");
  }
  async function palette(page) {
    return page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ["bg", "paper", "ink", "blue", "user-bg", "code-bg", "scheme"].map(key => {
        const value = style.getPropertyValue("--snap-" + key).trim();
        return /^#[0-9a-f]{3}$/i.test(value) ? "#" + [...value.slice(1)].map(character => character + character).join("") : value;
      });
    });
  }
  try {
    mock = await protocolProvider({ answer: "## 保持好奇，慢慢聊清楚\n\n换一种氛围，对话仍然继续。\n\n| 内容 | 状态 |\n| --- | --- |\n| 文字与图片 | 完整保留 |\n\n```js\nconst focus = 'one conversation';\n```" });
    await launch();
    await desktop.evaluate(async baseUrl => {
      const current = (await window.snap.providers()).providers.find(item => item.id === "openai");
      await window.snap.saveProvider({ apiVersion: 1, providerId: "openai", revision: current.revision, baseUrl, apiType: "responses", keyAction: "set", apiKey: "synthetic-appearance-only", modelIds: ["fixture-model", "cancel"] });
    }, mock.baseURL);
    const initial = await desktop.evaluate(() => window.snap.state());
    for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
      const browser = await engine.launch(); browsers.push(browser);
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "zh-CN" });
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(initial.pairingUrl);
      await page.locator('[aria-label="当前模型"]').selectOption("openai.fixture-model");
      await page.locator("#chat-input").fill("请帮我梳理这个想法");
      await page.locator("#send-message-button").click();
      await expect(page.locator(".message.assistant")).toContainText("保持好奇");
      await expect(page.getByRole("button", { name: "停止生成" })).toBeHidden();
      await page.locator("#chat-input").fill("主题切换时保留的草稿 · " + name);
      await expect(page.getByText("已保存", { exact: true })).toBeVisible();
      phones.push({ name, page, url: page.url() });
    }
    await desktop.locator('[data-view="appearance"]').click();
    await expect(desktop.locator(".theme-choice")).toHaveCount(catalog.themes.length);
    const before = mock.requests.length;
    for (const theme of catalog.themes) {
      await choose(theme.id);
      const current = await palette(desktop);
      for (const { name, page, url } of phones) {
        await themed(page, theme.id); expect(await palette(page)).toEqual(current);
        await expect(page.locator("#chat-input")).toHaveValue("主题切换时保留的草稿 · " + name);
        expect(page.url()).toBe(url); await expect(page.locator(".message.assistant")).toHaveCount(1);
        const composer = await page.locator(".composer").evaluate(node => ({ bg: getComputedStyle(node).backgroundColor, paper: getComputedStyle(document.documentElement).getPropertyValue("--snap-paper").trim() }));
        if (theme.id === "midnight") expect(composer.bg).toBe("rgb(32, 39, 51)");
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 });
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(root, `artifacts/appearance-${theme.id}-phone-${name}.png`), animations: "disabled" });
      }
      expect(mock.requests.length).toBe(before);
      await desktop.bringToFront();
      await desktop.screenshot({ scale: "css", path: path.join(root, `artifacts/appearance-${theme.id}-desktop.png`), animations: "disabled" });
    }
    // The pairing view reads only theme metadata, even while access is paused.
    const pair = await browsers[0].newPage({ viewport: { width: 390, height: 844 } });
    await pair.goto(initial.baseUrl + "/snap/pair"); await themed(pair, "midnight");
    await pair.screenshot({ path: path.join(root, "artifacts/appearance-midnight-pair.png"), animations: "disabled" });
    await desktop.locator("#pause").click();
    await choose("ocean"); for (const { page } of phones) await themed(page, "ocean"); await themed(pair, "ocean");
    await desktop.locator("#pause").click();
    await expect.poll(async () => (await desktop.evaluate(() => window.snap.state())).paused).toBe(false);
    // Switching must not replay or cancel the active SDK generation.
    const phone = phones[0].page;
    await phone.locator('[aria-label="当前模型"]').selectOption("openai.cancel");
    await phone.locator("#chat-input").fill("生成中切换主题"); await phone.locator("#send-message-button").click();
    await expect(phone.getByRole("button", { name: "停止生成" })).toBeVisible();
    await expect.poll(() => mock.requests.length).toBe(before + 1);
    const activeRequests = mock.requests.length;
    await phone.locator("#chat-input").fill("接下来想继续问的问题");
    await choose("clay"); await themed(phone, "clay");
    await expect(phone.getByRole("button", { name: "停止生成" })).toBeVisible();
    await expect(phone.locator("#chat-input")).toHaveValue("接下来想继续问的问题"); expect(mock.requests.length).toBe(activeRequests);
    await phone.getByRole("button", { name: "停止生成" }).click();
    await expect(phone.getByText("已保存", { exact: true })).toBeVisible();
    // A lost palette request preserves the last theme; reconnect catches up.
    await phone.route("**/snap/appearance", route => route.abort());
    await choose("midnight"); await themed(phones[1].page, "midnight"); await themed(phone, "clay");
    await phone.unroute("**/snap/appearance"); await phone.evaluate(() => dispatchEvent(new Event("focus"))); await themed(phone, "midnight");
    const saved = await desktop.evaluate(() => window.snap.state());
    const stale = await phone.evaluate(revision => window.scryletAppearance.apply({ apiVersion: 1, themeId: "forest", revision: revision - 1 }), saved.appearance.revision);
    expect(stale).toBe(false); await themed(phone, "midnight");
    await phone.reload(); await themed(phone, "midnight"); await expect(phone.locator("#chat-input")).toHaveValue("接下来想继续问的问题");
    await desktop.locator('[data-view="models"]').click();
    await expect(desktop.locator(".provider-option")).toHaveCount(6);
    await expect(desktop.locator("#api-key")).toHaveValue("");
    await desktop.bringToFront();
      await desktop.screenshot({ scale: "css", path: path.join(root, "artifacts/appearance-midnight-models.png"), animations: "disabled" });
    // Desktop restart must use its persisted preference, not the page cache.
    await stop(); await launch(); await themed(desktop, "midnight");
    expect((await desktop.evaluate(() => window.snap.state())).appearance).toEqual(saved.appearance);
    for (const { page } of phones) { await page.reload(); await themed(page, "midnight"); }
    expect(mock.requests.length).toBe(activeRequests); expect(errors).toEqual([]);
    await app.evaluate(async electron => {
      const load = process.getBuiltinModule("module").createRequire(electron.app.getAppPath() + "/package.json");
      const progress = await load("./desktop/migration-window.cjs").migrationWindow(electron);
      globalThis.appearanceMigrationWindow = progress;
    });
    const migration = app.windows().find(page => page.url().endsWith("migration.html"));
    await themed(migration, "midnight");
    await expect(migration.locator("main")).toHaveCSS("background-color", "rgb(32, 39, 51)");
    await app.evaluate(() => globalThis.appearanceMigrationWindow.close());
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(780, 700));
    await desktop.locator('[data-view="appearance"]').click();
    await expect(async () => {
      const height = await desktop.evaluate(() => innerHeight);
      for (const selector of [".desktop-nav", "#capture-send", "#test", "footer"]) {
        const box = await desktop.locator(selector).boundingBox(); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      }
    }).toPass({ timeout: 5000 });
    const report = { status: "passed", platform: process.platform, arch: process.arch, themes: catalog.themes.map(item => item.id), browsers: ["chromium", "webkit"], realDesktopIpc: true, realNodeGateway: true, synchronizedPalettes: true, draftsAndMessagesPreserved: true, activeGenerationNotReplayedOrCancelled: true, pairingAndPausedPageSync: true, offlineRecovery: true, staleResponseRejected: true, restartPersistence: true, migrationWindowTheme: true, minimumDesktopWindow: "780x700", widths: [320,390,430], pageErrors: errors, providerRequests: mock.requests.length, modelTraffic: "loopback-mock-only", physicalPhoneTested: false, finalPackagesTested: false };
    fs.writeFileSync(path.join(root, "artifacts/appearance-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log("Appearance acceptance passed: four palettes, real desktop IPC, Chromium/WebKit sync, draft/generation safety and restart persistence.");
  } catch (error) {
    if (desktop) await desktop.bringToFront();
      await desktop.screenshot({ scale: "css", path: path.join(base, "desktop-failure.png"), mask: [desktop.locator("#qr"), desktop.locator("#code"), desktop.locator("#address")] }).catch(() => {});
    for (const { name, page } of phones) await page.screenshot({ path: path.join(base, name + "-failure.png") }).catch(() => {});
    throw error;
  } finally {
    for (const browser of browsers) await browser.close();
    await stop(); await mock?.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
