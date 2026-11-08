// Actual default-source startup with a pinned synthetic legacy snapshot.
// APPDATA is redirected so discovery never touches the real user database.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  assert = require("node:assert/strict");
const { _electron, expect } = require("@playwright/test");
const root = path.resolve(__dirname, "..");
async function main(argv = process.argv.slice(2)) {
  if (argv.length && (argv.length !== 2 || argv[0] !== "--executable" || !path.isAbsolute(argv[1]))) throw Error("DEFAULT_MIGRATION_ARGUMENTS");
  const executablePath = argv[1];
  if (process.platform !== "win32") throw Error("当前自动迁移验收需要 Windows");
  const directory = fs.mkdtempSync(path.join(root, ".test-data/node-service-m5/default-migration-"));
  const appData = path.join(directory, "app-data"),
    legacy = path.join(appData, "Snap-Solver"),
    target = path.join(appData, "Scrylet");
  fs.mkdirSync(directory, { recursive: true });
  const provider = await require("../tests/fixtures/protocol-provider.cjs").protocolProvider();
  let app;
  const report = { platform: process.platform, application: executablePath ? "packaged" : "source", externalModelRequests: 0, checks: [] };
  try {
    const source = await require("../tests/migration/fixture.cjs").legacyFixture(legacy, provider.baseURL);
    const before = crypto.createHash("sha256").update(fs.readFileSync(path.join(legacy, "open-webui/webui.db"))).digest("hex");
    const env = {
      ...process.env,
      APPDATA: appData,
      SNAP_LEGACY_DIR: path.join(directory, "no-seeds"),
    };
    for (const key of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "NODE_PATH", "SNAP_RUNTIME_ENGINE", "SNAP_DATA_DIR", "SNAP_MIGRATION_SOURCE", "SNAP_STARTUP_METRICS"])
      delete env[key];
    for (const item of require("../config/providers.json").providers) delete env[item.envKey];
    app = await _electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env, cwd: directory });
    await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some(window => window.webContents.getURL().endsWith("/ui/index.html"))), { timeout: 30000 }).toBe(true);
    const desktop = (await app.windows()).find(window => window.url().endsWith("/ui/index.html"));
    await expect.poll(async () => {
      const state = await desktop.evaluate(() => window.snap.state());
      if (state.error) throw Error(state.error);
      return state.ready;
    }, { timeout: 30000 }).toBe(true);
    const state = await desktop.evaluate(() => window.snap.state());
    assert.equal(state.runtimeKind, "node");
    const paths = await app.evaluate(({ app }) => ({ userData: app.getPath("userData"), appData: app.getPath("appData") }));
    assert.equal(paths.userData, target);
    assert.equal(paths.appData, appData);
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), Boolean(executablePath));
    const engine = await app.evaluate(({ app }) => {
      const load = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json");
      return {
        selected: load("./package.json").scryletRuntimeDefault,
        override: process.env.SNAP_RUNTIME_ENGINE,
        legacyLoaded: Object.keys(load.cache).some(file => /legacy-(?:runtime|gateway|paths)\.cjs$/.test(file)),
      };
    });
    assert.deepEqual(engine, { selected: "node", override: undefined, legacyLoaded: false });
    const activationFile = path.join(target, "chat-node/v1/migration.json");
    assert.ok(fs.existsSync(activationFile));
    const activationBytes = fs.readFileSync(activationFile);
    const activation = JSON.parse(fs.readFileSync(activationFile, "utf8"));
    assert.equal(activation.status, "validated");
    assert.equal(crypto.createHash("sha256").update(fs.readFileSync(path.join(legacy, "open-webui/webui.db"))).digest("hex"), before);
    report.checks.push("default-source-node-without-engine-override", "automatic-pinned-legacy-migration", "legacy-source-bytes-preserved");
    await expect(desktop.locator("#service-status")).toHaveText("可以连接手机");
    const screenshot = path.join(root, "artifacts", executablePath ? "node-service-finalization-packaged.png" : "node-service-finalization-source.png");
    await desktop.screenshot({ path: screenshot });
    report.screenshot = path.relative(root, screenshot);
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
    await app.close(); app = null;
    app = await _electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: [root] }), env, cwd: directory });
    const restarted = await app.firstWindow();
    await expect.poll(() => restarted.evaluate(async () => (await window.snap.state()).ready), { timeout: 30000 }).toBe(true);
    assert.ok(fs.readFileSync(activationFile).equals(activationBytes));
    report.checks.push("restart-does-not-repeat-migration");
    report.status = "passed";
    report.sourceChatId = source.chatId;
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    throw error;
  } finally {
    if (app) { await app.evaluate(({ app }) => app.quit()).catch(() => {}); await app.close().catch(() => {}); }
    await provider.stop();
    fs.writeFileSync(path.join(directory, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, evidence: path.relative(root, directory) }));
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
