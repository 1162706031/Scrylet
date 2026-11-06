const path = require("node:path");

class SelectionOverlay {
  constructor(electron) {
    this.electron = electron;
  }
  show(state, settings) {
    this.state = state;
    this.settings = settings;
    if (!this.window) {
      const { BrowserWindow, screen } = this.electron;
      const point = state.first || screen.getCursorScreenPoint();
      this.bounds = screen.getDisplayNearestPoint(point).bounds;
      this.window = new BrowserWindow({
        ...this.bounds, frame: false, transparent: true, focusable: false,
        skipTaskbar: true, alwaysOnTop: true, hasShadow: false, show: false,
        resizable: false, movable: false,
        webPreferences: {
          preload: path.join(__dirname, "selection-preload.cjs"),
          contextIsolation: true, sandbox: true, nodeIntegration: false,
        },
      });
      this.window.setIgnoreMouseEvents(true);
      this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.window.webContents.on("will-navigate", (event) => event.preventDefault());
      this.window.loadFile(path.join(__dirname, "ui/selection.html")).then(() => {
        if (!this.window) return;
        this.window.showInactive();
        this.update();
      }).catch(() => this.close());
      this.timer = setInterval(() => this.update(), 100);
    }
    this.update();
  }
  update() {
    if (!this.window || this.window.isDestroyed() || this.window.webContents.isLoading()) return;
    this.window.webContents.send("snap:selection-state", {
      ...this.state, holdMs: this.settings.holdMs, timeoutMs: this.settings.timeoutMs,
      mouseButton: this.settings.mouseButton, cancelShortcut: this.settings.cancelShortcut,
      cursor: this.electron.screen.getCursorScreenPoint(), bounds: this.bounds,
    });
  }
  close() {
    clearInterval(this.timer);
    this.window?.destroy();
    this.window = null;
  }
}

module.exports = { SelectionOverlay };
