const startupStartedAt = require("node:perf_hooks").performance.now();
const { StartupMetrics } = require("./startup-metrics.cjs");
const startup = new StartupMetrics({ startedAt: startupStartedAt,
  enabled: process.env.SNAP_STARTUP_METRICS === "1" && Boolean(process.env.SNAP_DATA_DIR) });
startup.mark("app-start");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  shell,
  dialog,
} = require("electron");
const electron = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { Runtime, runtimeDefault } = require("./runtime.cjs");
const { Gateway } = require("./gateway.cjs");
const { createNative } = require("./native.cjs");
const { CaptureControls } = require("./capture-controls.cjs");
const { ActivityLog, reasonFor } = require("./activity-log.cjs");
const { Maintenance } = require("./maintenance.cjs");
const { validate } = require("../contracts/validate.cjs");
const { NAME, APP_ID, dataDirectory, migrationSource } = require("./brand.cjs");
const ROOT = path.resolve(__dirname, "..");
const page = path.join(__dirname, "ui/index.html");
let window,
  tray,
  runtime,
  gateway,
  captureControls,
  activity,
  maintenance,
  quitting = false,
  shutDown = false;

app.setName(NAME);
if (process.platform === "win32") app.setAppUserModelId(APP_ID);
// Electron's Windows Known Folder lookup can ignore redirected APPDATA.
// Honor the explicit Windows profile path before discovery or writer startup.
if (process.platform === "win32" && path.isAbsolute(process.env.APPDATA || ""))
  app.setPath("appData", path.resolve(process.env.APPDATA));
const selectedEngine = runtimeDefault();
if (process.env.SNAP_RUNTIME_ENGINE && process.env.SNAP_RUNTIME_ENGINE !== selectedEngine)
  throw new Error("此版本仅支持 Node 聊天服务");
const exportIndex = process.argv.indexOf("--scrylet-export-legacy");
if (exportIndex >= 0) {
  const output = process.argv[exportIndex + 1];
  const isolatedExport = selectedEngine === "node" && process.env.SNAP_DATA_DIR && path.isAbsolute(process.env.SNAP_DATA_DIR);
  if (!isolatedExport || !output || !path.isAbsolute(output) || process.argv.lastIndexOf("--scrylet-export-legacy") !== exportIndex) app.exit(2);
  else {
    app.setPath("userData", process.env.SNAP_DATA_DIR);
    if (!app.requestSingleInstanceLock()) app.exit(2);
    else app.whenReady().then(() => require("./migration.cjs").rollbackLegacy(process.env.SNAP_DATA_DIR, output, electron.safeStorage))
      .then(report => { process.stdout.write(JSON.stringify(report) + "\n"); app.exit(0); })
      .catch(() => { process.stderr.write("旧版副本未完成，原数据保持不变；请先退出正在使用该数据的应用并检查迁移记录。\n"); app.exit(1); });
  }
} else {
  // Normal source and installed launches use Scrylet userData. Tests redirect
  // APPDATA or explicitly set SNAP_DATA_DIR; no real database is needed here.
  app.setPath("userData", dataDirectory(app.getPath("appData"), process.env.SNAP_DATA_DIR, selectedEngine));
  if (!app.requestSingleInstanceLock()) {
    app.quit();
  } else {
    app.on("second-instance", () => {
      window?.show();
      window?.focus();
    });
    app
      .whenReady()
      .then(start)
      .catch((error) => {
        activity?.record("runtime.failed", { reason: reasonFor(error) });
        dialog.showErrorBox("无法启动 " + NAME, error.message);
        app.quit();
      });
  }
}

async function start() {
  let migrationProgress;
  const legacySource = selectedEngine === "node"
    ? migrationSource(app.getPath("appData"), process.env.SNAP_DATA_DIR, process.env.SNAP_MIGRATION_SOURCE)
    : null;
  if (legacySource) {
    migrationProgress = await require("./migration-window.cjs").migrationWindow(electron);
    try { await require("./migration.cjs").migrateLegacy(legacySource, app.getPath("userData"), electron.safeStorage, { onProgress: value => migrationProgress.update(value) }); }
    catch (error) { migrationProgress.close(); throw error; }
  }
  activity = new ActivityLog(app.getPath("userData"));
  activity.record("app.started");
  const native = createNative(electron);
  runtime = new Runtime(app.getPath("userData"), {
    bootstrapSources: true,
    legacySource,
    onStartupPhase: (phase) => startup.mark(phase),
    legacyDirectory:
      process.env.SNAP_LEGACY_DIR || path.join(ROOT, ".snapsolver"),
  });
  gateway = new Gateway(app.getPath("userData"), native, runtime, { activity });
  await gateway.start(Number(process.env.SNAP_PORT || 0));
  startup.mark("gateway-listening");
  captureControls = new CaptureControls(electron, app.getPath("userData"), {
    native, gateway, runtime, activity, getWindow: () => window,
    legacyDirectory: process.env.SNAP_LEGACY_DIR || path.join(ROOT, ".snapsolver"),
  });
  function handle(channel, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      if (
        event.sender !== window?.webContents ||
        event.senderFrame?.url !== pathToFileURL(page).href
      ) {
        throw new Error("不接受来自其他页面的桌面操作");
      }
      return callback(...args);
    });
  }
  const connectionState = async () => ({
    ...(await gateway.state()),
    backgroundAvailable: Boolean(tray),
    capture: captureControls.snapshot(),
  });
  handle("snap:state", connectionState);
  if (startup.enabled) {
    handle("snap:startup-metrics", () => startup.snapshot());
    handle("snap:startup-observed", (phase) => startup.observe(phase));
  }
  handle("snap:refresh-code", () => {
    gateway.pairing.rotate();
    return connectionState();
  });
  handle("snap:network", (address) => {
    gateway.selectNetwork(address);
    return connectionState();
  });
  handle("snap:revoke", (id) => {
    gateway.revoke(String(id));
    return connectionState();
  });
  handle("snap:pause", (value) => {
    gateway.pause(value);
    return connectionState();
  });
  handle("snap:permission", () => native.openPermission());
  handle("snap:mouse-permission", () => process.platform === "darwin"
    ? shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
    : undefined);
  handle("snap:test-capture", async () => {
    try {
      const result = await native.capture();
      activity.record("capture.completed", { origin: "check", width: result.width, height: result.height });
      return { width: result.width, height: result.height };
    } catch (error) {
      activity.record("capture.failed", { origin: "check", reason: reasonFor(error) });
      throw error;
    }
  });
  handle("snap:copy", async () => native.copy((await gateway.state()).baseUrl));
  handle("snap:preview", async () => {
    const state = await gateway.state();
    await shell.openExternal(state.pairingUrl);
  });
  handle("snap:quit", () => app.quit());
  handle("snap:capture-send", () => captureControls.capture("full"));
  handle("snap:capture-region", () => captureControls.arm());
  handle("snap:capture-cancel", () => captureControls.cancel());
  handle("snap:capture-settings", (settings) => captureControls.configure(settings));
  handle("snap:capture-suspend", (value) => captureControls.suspend(value));
  handle("snap:activity", () => activity.list());
  handle("snap:cache-info", () => maintenance.stats());
  handle("snap:cache-clear", () => maintenance.clearCache());
  handle("snap:appearance-save", change => gateway.appearance.save(change));
  handle("snap:providers", () => runtime.providers());
  handle("snap:provider-save", async (change) => {
    const value = validate("providerChange", change);
    await runtime.saveProvider(value.providerId, value);
    activity.record("provider.saved");
    return runtime.providers();
  });
  window = new BrowserWindow({
    title: NAME,
    icon: path.join(ROOT, "static", process.platform === "win32" ? "favicon.ico" : "favicon.png"),
    width: 860,
    height: 740,
    minWidth: 780,
    minHeight: 700,
    backgroundColor: "#ffffff",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.webContents.setAudioMuted(true);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  maintenance = new Maintenance(window.webContents.session, app.getPath("sessionData"), activity);
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  window.on("close", (event) => {
    if (!quitting && tray) {
      event.preventDefault();
      window.hide();
    }
  });
  await window.loadFile(page);
  window.show();
  migrationProgress?.close();
  startup.mark("window-visible");
  captureControls.start();
  captureControls.on("change", (state) => {
    if (!window?.isDestroyed()) window?.webContents.send("snap:capture-state", state);
  });
  window.on("blur", () => captureControls.suspend(false));
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: NAME,
        submenu: [
          { label: "显示连接窗口", click: () => window.show() },
          { label: "截屏并发送", click: () => captureControls.run(() => captureControls.capture("full")) },
          { label: "区域截屏", click: () => captureControls.run(() => captureControls.arm()) },
          { type: "separator" },
          { role: "quit", label: "退出 " + NAME },
        ],
      },
      { role: "editMenu", label: "编辑" },
      { role: "windowMenu", label: "窗口" },
    ]),
  );
  try {
    const icon = nativeImage.createFromPath(path.join(ROOT, process.platform === "darwin" ? "web/brand/trayTemplate.png" : "static/favicon.png"));
    if (icon.isEmpty()) throw new Error("应用图标未加载");
    if (process.platform === "darwin") icon.setTemplateImage(true);
    tray = new Tray(icon);
    tray.setToolTip(NAME + " · 手机连接服务");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "打开 " + NAME, click: () => window.show() },
        { label: "截屏并发送", click: () => captureControls.run(() => captureControls.capture("full")) },
        { label: "区域截屏", click: () => captureControls.run(() => captureControls.arm()) },
        { label: "退出", click: () => app.quit() },
      ]),
    );
    tray.on("click", () => window.show());
  } catch {
    tray = null; /* Without a tray, closing the window quits normally. */
  }
  try {
    await runtime.start();
    activity.record("runtime.ready");
  } catch (error) {
    activity.record("runtime.failed", { reason: reasonFor(error) });
    runtime.error = error.message;
    await runtime.stop();
  }
}
app.on("activate", () => window?.show());
app.on("window-all-closed", () => {
  if (!tray) app.quit();
});
app.on("before-quit", (event) => {
  quitting = true;
  if (shutDown) return;
  event.preventDefault();
  const inputStopped = captureControls?.close();
  if (gateway) gateway.closing = true;
  Promise.allSettled([inputStopped, runtime?.stop()]).finally(() => gateway?.close()).catch(() => {}).then(() => {
    activity?.record("app.stopped");
    shutDown = true;
    tray?.destroy();
    app.quit();
  });
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.quit());
