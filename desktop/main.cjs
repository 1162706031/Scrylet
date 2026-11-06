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
const { Runtime } = require("./runtime.cjs");
const { Gateway } = require("./gateway.cjs");
const { createNative } = require("./native.cjs");
const { CaptureControls } = require("./capture-controls.cjs");
const { ActivityLog, reasonFor } = require("./activity-log.cjs");
const { Maintenance } = require("./maintenance.cjs");
const { NAME, APP_ID, dataDirectory } = require("./brand.cjs");
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
app.setPath("userData", dataDirectory(app.getPath("appData"), process.env.SNAP_DATA_DIR));
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

async function start() {
  activity = new ActivityLog(app.getPath("userData"));
  activity.record("app.started");
  const native = createNative(electron);
  runtime = new Runtime(app.getPath("userData"), {
    legacyDirectory:
      process.env.SNAP_LEGACY_DIR || path.join(ROOT, ".snapsolver"),
  });
  gateway = new Gateway(app.getPath("userData"), native, runtime, { activity });
  await gateway.start(Number(process.env.SNAP_PORT || 0));
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
  window = new BrowserWindow({
    title: NAME,
    icon: path.join(ROOT, "web/brand/icon.png"),
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
    const icon = nativeImage.createFromPath(path.join(ROOT, "web/brand", process.platform === "darwin" ? "trayTemplate.png" : "icon.png"));
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
  captureControls?.close();
  Promise.allSettled([runtime?.stop(), gateway?.close()]).then(() => {
    activity?.record("app.stopped");
    shutDown = true;
    tray?.destroy();
    app.quit();
  });
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => app.quit());
