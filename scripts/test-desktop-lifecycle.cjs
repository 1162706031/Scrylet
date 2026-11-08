const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process"),
  { setTimeout: delay } = require("node:timers/promises");
const { _electron, expect } = require("@playwright/test");
const root = path.resolve(__dirname, "..");
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw Error("DESKTOP_LIFECYCLE_TIMEOUT");
    await delay(30);
  }
}
function gone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return true;
  }
}
async function children(app) {
  return app.evaluate(({ app }) => {
    const observer = process
      ._getActiveHandles()
      .filter(
        (handle) =>
          handle.pid &&
          typeof handle.spawnfile === "string" &&
          handle.spawnfile.endsWith("input-observer.exe"),
      )
      .map((handle) => ({ id: handle.pid, kind: "observer" }));
    const service = app
      .getAppMetrics()
      .filter(
        (metric) =>
          metric.name === "Scrylet Chat Service" ||
          metric.serviceName === "Scrylet Chat Service",
      )
      .map((metric) => ({ id: metric.pid, kind: "service" }));
    return [...observer, ...service];
  });
}

async function main() {
  if (process.platform !== "win32") throw Error("此生命周期验收需要 Windows");
  const directory = fs.mkdtempSync(
    path.join(root, ".test-data/node-service-m3/lifecycle-"),
  );
  const report = {
    platform: process.platform,
    arch: process.arch,
    packaged: Boolean(process.env.SNAP_TEST_EXECUTABLE),
    checks: [],
  };
  let app;
  const env = {
    ...process.env,
    SNAP_RUNTIME_ENGINE: "node",
    SNAP_DATA_DIR: path.join(directory, "data"),
    SNAP_LEGACY_DIR: path.join(directory, "absent"),
  };
  for (const key of ["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS", "NODE_PATH"])
    delete env[key];
  for (const provider of require("../config/providers.json").providers)
    delete env[provider.envKey];
  const launch = async () => {
    app = await _electron.launch({
      ...(process.env.SNAP_TEST_EXECUTABLE
        ? { executablePath: process.env.SNAP_TEST_EXECUTABLE, args: [] }
        : { args: [root] }),
      env,
      cwd: directory,
    });
    const page = await app.firstWindow();
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(() => window.snap.state());
          if (state.error) throw Error("APP_RUNTIME_FAILED");
          return state.ready && state.capture.mouseReady;
        },
        { timeout: 30000 },
      )
      .toBe(true);
    return page;
  };
  try {
    const desktop = await launch();
    let tracked = await children(app);
    assert.ok(tracked.some((c) => c.kind === "observer"));
    assert.ok(tracked.some((c) => c.kind === "service"));
    const closed = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.close();
      return { visible: w.isVisible(), destroyed: w.isDestroyed() };
    });
    assert.deepEqual(closed, { visible: false, destroyed: false });
    await app.evaluate(({ Menu }) => {
      const item = Menu.getApplicationMenu().items[0].submenu.items.find(
        (i) => i.label === "显示连接窗口",
      );
      item.click();
    });
    assert.equal(
      await desktop.evaluate(() => document.visibilityState),
      "visible",
    );
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.isAudioMuted(),
      ),
      true,
    );
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
    await app.close();
    app = null;
    await until(() => tracked.every((c) => gone(c.id)));
    report.checks.push(
      "close-to-tray-menu-reopen-muted",
      "normal-exit-reaps-native-and-service",
    );
    await launch();
    tracked = await children(app);
    assert.ok(tracked.some((c) => c.kind === "observer"));
    assert.ok(tracked.some((c) => c.kind === "service"));
    const pid = await app.evaluate(() => process.pid);
    const killed = spawnSync("taskkill.exe", ["/PID", String(pid), "/F"], {
      stdio: "ignore",
    });
    assert.equal(killed.status, 0);
    await until(() => tracked.every((c) => gone(c.id)), 10000);
    await app.close().catch(() => {});
    app = null;
    report.checks.push("parent-only-kill-reaps-observer-and-node");
    await launch();
    assert.ok(
      fs.existsSync(path.join(env.SNAP_DATA_DIR, "chat-node/v1/chat.sqlite")),
    );
    await app.evaluate(({ app }) => app.quit()).catch(() => {});
    await app.close();
    app = null;
    report.checks.push("restart-opens-storage-after-crash-no-lock-orphan");
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.code = error.message;
    throw error;
  } finally {
    if (app) {
      await app.evaluate(({ app }) => app.quit()).catch(() => {});
      await app.close().catch(() => {});
    }
    fs.writeFileSync(
      path.join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({ ...report, evidence: path.relative(root, directory) }),
    );
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
