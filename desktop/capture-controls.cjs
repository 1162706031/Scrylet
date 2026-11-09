const path = require("node:path");
const { EventEmitter } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const { readJson, writeJson } = require("./pairing.cjs");
const { defaults, validateSettings } = require("./capture-settings.cjs");
const { RegionGesture } = require("./region-gesture.cjs");
const { MouseInput } = require("./mouse-input.cjs");
const { reasonFor } = require("./activity-log.cjs");

class CaptureControls extends EventEmitter {
  constructor(electron, directory, { native, gateway, runtime, activity, getWindow, legacyDirectory }) {
    super();
    Object.assign(this, { electron, native, gateway, runtime, activity, getWindow });
    this.file = path.join(directory, "capture-settings.json");
    this.settings = validateSettings(readJson(this.file, defaults(legacyDirectory)));
    this.mouse = new MouseInput((event) => this.pointer(event), (message) => {
      this.mouseReady = false;
      this.activity?.record("mouse.failed");
      this.gesture?.cancel();
      this.report(message, true);
    });
    this.registered = [];
    this.phase = "idle";
    this.message = "";
    this.error = false;
    this.busy = false;
    this.mouseReady = false;
  }
  start() {
    try { this.register(this.settings); } catch (error) { this.report(error.message, true); }
    this.createGesture();
    if (this.settings.mouseEnabled || this.settings.doubleClickEnabled) this.mouse.start(this.settings.mouseButton);
  }
  register(settings) {
    const globalShortcut = this.electron.globalShortcut;
    for (const key of this.registered) globalShortcut.unregister(key);
    this.registered = [];
    for (const [key, action] of [
      [settings.fullShortcut, () => this.run(() => this.capture("full"))],
      [settings.regionShortcut, () => this.run(() => this.arm())],
    ]) {
      let registered = false;
      try { registered = globalShortcut.register(key, action); } catch { /* Show the same actionable error. */ }
      if (!registered) {
        for (const registeredKey of this.registered) globalShortcut.unregister(registeredKey);
        this.registered = [];
        throw new Error("快捷键不可用或已被占用：" + key + "，请在截图设置中修改");
      }
      this.registered.push(key);
    }
  }
  configure(data) {
    if (this.busy) throw new Error("截图正在发送，完成后再修改设置");
    const next = validateSettings(data);
    const previous = this.settings;
    this.gesture.cancel();
    try {
      this.register(next);
      const shortcut = this.electron.globalShortcut;
      if (!shortcut.register(next.cancelShortcut, () => {})) throw new Error("取消快捷键已被占用");
      shortcut.unregister(next.cancelShortcut);
      writeJson(this.file, next);
    } catch (error) {
      this.register(previous);
      throw error;
    }
    this.settings = next;
    this.mouse.stop();
    this.mouseReady = false;
    this.createGesture();
    if (next.mouseEnabled || next.doubleClickEnabled) this.mouse.start(next.mouseButton);
    this.report("截图设置已保存");
    this.activity?.record("settings.saved");
    return this.snapshot();
  }
  createGesture() {
    this.gesture = new RegionGesture({
      ...this.settings,
      doubleMs: this.settings.doubleClickEnabled ? this.settings.doubleClickMs : 0,
      holdEnabled: this.settings.mouseEnabled,
      onChange: (state) => this.selection(state),
      onRegion: (first, second) => this.run(() => this.capture("region", first, second)),
      onDoubleClick: () => this.run(() => this.capture("full")),
    });
  }
  snapshot() {
    return {
      settings: this.settings, phase: this.phase, busy: this.busy,
      mouseReady: this.mouseReady, mouseSupported: MouseInput.supported(),
      receiver: this.gateway.delivery.status(), message: this.message, error: this.error,
    };
  }
  report(message, error = false) {
    this.message = message;
    this.error = error;
    this.emit("change", this.snapshot());
  }
  ensureReady() {
    if (this.busy) throw new Error("上一张截图正在发送，请稍候");
    if (this.gateway.paused) throw new Error("请先恢复手机访问");
    if (!this.runtime.ready || this.runtime.error) throw new Error("请等待聊天服务启动完成");
    if (this.native.permission() !== "granted") throw new Error("请先允许屏幕录制权限");
    return this.gateway.delivery.target();
  }
  arm() {
    this.ensureReady();
    if (!MouseInput.supported()) throw new Error("这台电脑暂不支持鼠标区域截图；可使用手机框选");
    this.gesture.arm();
    if (!this.settings.mouseEnabled && !this.mouseReady) this.mouse.start(this.settings.mouseButton);
    const window = this.getWindow();
    if (window?.isVisible()) {
      window.hide();
    }
    return { success: true };
  }
  selection(state) {
    const previous = this.phase;
    this.phase = state.phase;
    if (previous === "idle" && state.phase !== "idle") this.activity?.record("region.started");
    if (previous !== "idle" && state.phase === "idle" && state.message)
      this.activity?.record(state.message.includes("超时") ? "region.timeout" : "region.cancelled");
    if (state.phase === "idle") {
      this.electron.globalShortcut.unregister(this.settings.cancelShortcut);
      if (!this.settings.mouseEnabled && !this.settings.doubleClickEnabled) {
        this.mouse.stop();
        this.mouseReady = false;
      }
      if (state.message) this.report(state.message);
    } else {
      if (previous === "idle") {
        try {
          if (!this.electron.globalShortcut.register(this.settings.cancelShortcut, () => this.cancel()))
            this.report("取消快捷键被占用；选区仍会在超时后自动取消", true);
        } catch { this.report("取消快捷键无效，请修改截图设置", true); }
      }
    }
    this.emit("change", this.snapshot());
  }
  pointer(event) {
    if (event.type === "ready") {
      this.mouseReady = true;
      this.mouseCoordinates = event.coordinateSpace;
      this.emit("change", this.snapshot());
      return;
    }
    if (event.type === "cancel") { this.gesture.cancel(); return; }
    if (this.suspended || this.busy) return;
    const active = this.phase !== "idle";
    if (!active && !this.settings.mouseEnabled && !this.settings.doubleClickEnabled) return;
    if (event.type === "down") {
      if (!this.gateway.delivery.status().ready || this.gateway.paused || !this.runtime.ready) {
        if (active) this.cancel();
        return;
      }
      const point = this.pointerPoint(event);
      const window = this.getWindow();
      if (!active && window?.isFocused()) {
        const bounds = window.getBounds();
        if (point.x >= bounds.x && point.x < bounds.x + bounds.width &&
            point.y >= bounds.y && point.y < bounds.y + bounds.height) return;
      }
      this.gesture.down(point);
    } else if (event.type === "move") {
      this.gesture.move(this.pointerPoint(event));
    } else if (event.type === "up") this.gesture.up();
  }
  pointerPoint(event) {
    const point = { x: event.x, y: event.y };
    return this.mouseCoordinates === "dip" ? point : this.electron.screen.screenToDipPoint(point);
  }
  suspend(value) {
    this.suspended = value === true;
    this.electron.globalShortcut.setSuspended(this.suspended);
    if (this.suspended) this.gesture.cancel();
  }
  cancel() {
    this.gesture.cancel("选区已取消");
  }
  async capture(kind, first, second) {
    let receiver;
    try { receiver = this.ensureReady(); } catch (error) {
      this.activity?.record("capture.rejected", { origin: "desktop", mode: kind, reason: reasonFor(error) });
      throw error;
    }
    this.activity?.record("capture.started", { origin: "desktop", mode: kind });
    const displayId = String(this.electron.screen.getDisplayNearestPoint(
      this.electron.screen.getCursorScreenPoint(),
    ).id);
    this.busy = true;
    this.gesture.cancel();
    const window = this.getWindow();
    const visible = window?.isVisible();
    if (visible) window.hide();
    this.report("正在截屏…");
    try {
      // Let the compositor remove the connection window before screen capture.
      await delay(150);
      if (this.gateway.paused) throw new Error("手机访问已暂停");
      const capture = kind === "region"
        ? await this.native.captureRegion(first, second)
        : await this.native.capture(displayId);
      this.report("正在发送截图…");
      const result = await this.gateway.delivery.send(receiver, capture, this.settings.prompt);
      this.report("截图已发送到 " + result.name);
      this.activity?.record("capture.sent", { origin: "desktop", mode: kind, width: capture.width, height: capture.height });
      return { ...result, width: capture.width, height: capture.height };
    } catch (error) {
      this.activity?.record("capture.failed", { origin: "desktop", mode: kind, reason: reasonFor(error) });
      this.report(error.message || "截图发送失败", true);
      throw error;
    } finally {
      this.busy = false;
      this.emit("change", this.snapshot());
    }
  }
  run(action) {
    Promise.resolve().then(action).catch((error) => this.report(error.message || "截图失败", true));
  }
  close() {
    this.gesture?.cancel();
    const stopped = this.mouse.stop();
    for (const key of this.registered) this.electron.globalShortcut.unregister(key);
    this.electron.globalShortcut.setSuspended(false);
    return stopped;
  }
}

module.exports = { CaptureControls };
