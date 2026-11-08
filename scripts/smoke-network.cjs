const { openDesktopSection } = require("./desktop-ui-navigation.cjs");
// Native Windows/source or packaged-client acceptance, with isolated data.
const { _electron: electron, chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const catalog = require("../config/providers.json");
const { addresses } = require("../desktop/native.cjs");
const { defaults } = require("../desktop/capture-settings.cjs");
const root = path.resolve(__dirname, "..");

(async () => {
  const networks = addresses();
  if (!networks.length) throw new Error("本机没有可用于验收的 IPv4 网卡。");
  const expected = networks[0];
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-network-app-"));
  const env = { ...process.env, SNAP_RUNTIME_ENGINE: "node", SNAP_DATA_DIR: directory, SNAP_LEGACY_DIR: path.join(directory, "no-legacy") };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.SNAP_PYTHON;
  for (const provider of catalog.providers) env[provider.envKey] = "";
  fs.writeFileSync(path.join(directory, "capture-settings.json"), JSON.stringify({
    ...defaults(env.SNAP_LEGACY_DIR), mouseEnabled: false,
    fullShortcut: "Ctrl+Alt+F10", regionShortcut: "Ctrl+Alt+F11",
  }));
  const executablePath = process.env.SNAP_TEST_EXECUTABLE;
  let app, page, browser;
  const launch = async () => {
    app = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env });
    page = await app.firstWindow();
    await expect.poll(async () => {
      const state = await page.evaluate(() => window.snap.state());
      if (state.error) throw new Error(state.error);
      return state.ready;
    }, { timeout: 120000 }).toBe(true);
  };
  const stop = async () => {
    if (!app) return;
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
    await app.close();
    app = null;
  };
  const openNetworks = async () => {
    const panel = page.locator(".connection-settings");
    await openDesktopSection(page, "network");
    await expect(panel).toHaveAttribute("open", "");
    await expect(page.locator("#networks")).toBeVisible();
  };
  try {
    await launch();
    let state = await page.evaluate(() => window.snap.state());
    expect(state.selectedAddress).toBe(expected.address);
    expect(new URL(state.pairingUrl).origin).toBe(state.baseUrl);
    for (const route of ["/snap/pair", "/snap/vendor/cropper.js", "/snap/vendor/cropper.css"])
      expect((await page.request.get(state.baseUrl + route)).status(), route).toBe(200);
    await openNetworks();
    await expect(page.locator("#networks")).toHaveValue(expected.address);
    const alternative = networks.find((item) => item.address !== expected.address);
    const chosen = alternative || expected;
    await page.locator("#networks").selectOption(chosen.address);
    await expect.poll(async () => (await page.evaluate(() => window.snap.state())).selectedAddress).toBe(chosen.address);
    const persisted = JSON.parse(fs.readFileSync(path.join(directory, "network.json")));
    expect(persisted.selectedNetwork).toEqual({ name: chosen.name, address: chosen.address });
    const port = new URL(state.baseUrl).port;
    await stop();
    await launch();
    state = await page.evaluate(() => window.snap.state());
    expect(state.selectedAddress).toBe(chosen.address);
    expect(new URL(state.baseUrl).port).toBe(port);
    await openNetworks();
    await page.locator("#networks").selectOption(expected.address);
    await expect.poll(async () => (await page.evaluate(() => window.snap.state())).selectedAddress).toBe(expected.address);
    await expect(page.locator("#address")).toHaveText("http://" + expected.address + ":" + port);
    state = await page.evaluate(() => window.snap.state());
    expect(new URL(state.pairingUrl).origin).toBe(state.baseUrl);
    await expect(page.locator("#qr")).toHaveAttribute("src", state.qr);
    browser = await chromium.launch();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    // Exercise the QR link at the selected LAN origin, without printing its token.
    await phone.goto(state.pairingUrl);
    await expect.poll(async () => (await phone.request.get(state.baseUrl + "/snap/api/status")).status(), { timeout: 30000 }).toBe(200);
    expect((await page.evaluate(() => window.snap.state())).devices.length).toBe(1);
    await expect(page.locator("#device-count")).toHaveText("1 台");
    await expect(page.locator("#service-status")).toHaveText("可以连接手机");
    await page.locator(".connection-settings").scrollIntoViewIfNeeded();
    fs.mkdirSync(path.join(root, "artifacts"), { recursive: true });
    const suffix = executablePath ? "-packaged" : "";
    await page.screenshot({ path: path.join(root, "artifacts/network" + suffix + ".png"), scale: "css", mask: [page.locator("#qr"), page.locator("#code"), page.locator("#address")] });
    const { packaged, version } = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion() }));
    if (executablePath) expect(packaged).toBe(true);
    expect(version).toBe(require("../package.json").version);
    const report = {
      at: new Date().toISOString(), platform: process.platform, packaged, version,
      defaultNetwork: expected, manualSelection: chosen, restartSelectionPreserved: true,
      qrOriginMatchesManualAddress: true, pairingAtLanOrigin: true,
      physicalPhoneTested: false, externalModelRequests: 0,
    };
    fs.writeFileSync(path.join(root, "artifacts/network" + suffix + "-check.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } catch (error) {
    const failure = path.join(root, ".test-data/network-failure-" + Date.now());
    fs.mkdirSync(failure, { recursive: true });
    if (page) await page.screenshot({ path: path.join(failure, "window.png") }).catch(() => {});
    console.error("Network acceptance failure evidence: " + failure);
    throw error;
  } finally {
    await browser?.close();
    await stop();
    await fs.promises.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
