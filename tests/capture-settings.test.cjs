const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { CaptureControls } = require("../desktop/capture-controls.cjs");
const { defaults, validateSettings } = require("../desktop/capture-settings.cjs");
test("Mac DIP 鼠标坐标直接进入手势，Windows 物理坐标才缩放", () => {
  const controls = { mouseCoordinates: "dip", electron: { screen: { screenToDipPoint: () => { throw Error("Mac 不支持此转换"); } } } };
  assert.deepEqual(CaptureControls.prototype.pointerPoint.call(controls, { x: -240, y: 120 }), { x: -240, y: 120 });
  controls.mouseCoordinates = "physical";
  controls.electron.screen.screenToDipPoint = ({ x, y }) => ({ x: x / 2, y: y / 2 });
  assert.deepEqual(CaptureControls.prototype.pointerPoint.call(controls, { x: 240, y: 120 }), { x: 120, y: 60 });
});
test("只开启双击时也启动鼠标监听", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-double-listener-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const controls = new CaptureControls({ globalShortcut: { register: () => true, unregister: () => {} } }, directory,
    { legacyDirectory: path.join(directory, "no-legacy") });
  const started = [];
  controls.settings = { ...controls.settings, mouseEnabled: false, doubleClickEnabled: true, mouseButton: "right" };
  controls.mouse = { start: button => started.push(button), stop: () => Promise.resolve() };
  controls.start();
  assert.deepEqual(started, ["right"]);
  assert.equal(controls.gesture.holdEnabled, false);
  assert.equal(controls.gesture.doubleMs, controls.settings.doubleClickMs);
});

for (const legacyFlag of [undefined, false, true]) test(`旧提示设置为 ${legacyFlag} 时强制静默且不改写原文件`, (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-silent-settings-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const settings = defaults(path.join(directory, "no-legacy"));
  assert.equal(settings.showCaptureHints, false);
  if (legacyFlag === undefined) delete settings.showCaptureHints;
  else settings.showCaptureHints = legacyFlag;
  const file = path.join(directory, "capture-settings.json");
  const content = JSON.stringify(settings);
  fs.writeFileSync(file, content);
  const controls = new CaptureControls({}, directory, {
    legacyDirectory: path.join(directory, "no-legacy"),
  });
  assert.equal(controls.settings.showCaptureHints, false);
  assert.equal(fs.readFileSync(file, "utf8"), content);
  assert.throws(() => validateSettings({ ...settings, showCaptureHints: "true" }), /提示开关/);
});

test("快捷键冲突回滚旧注册和配置，成功保存才更新持久化设置", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-capture-settings-"));
  const registered = new Map();
  const electron = { globalShortcut: {
    register: (key, action) => {
      if (key === "Ctrl+Alt+F4" || registered.has(key)) return false;
      registered.set(key, action);
      return true;
    },
    unregister: (key) => registered.delete(key),
    setSuspended: () => {},
  } };
  const controls = new CaptureControls(electron, directory, {
    native: {}, runtime: {}, gateway: { delivery: { status: () => ({}) } },
    getWindow: () => null, legacyDirectory: path.join(directory, "no-legacy"),
  });
  controls.register(controls.settings);
  controls.createGesture();
  t.after(() => { controls.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const previous = controls.settings;
  assert.throws(() => controls.configure({ ...previous, mouseEnabled: false, fullShortcut: "Ctrl+Alt+F4" }), /被占用/);
  assert.deepEqual([...registered.keys()], [previous.fullShortcut, previous.regionShortcut]);
  assert.equal(controls.settings, previous);
  assert.equal(fs.existsSync(controls.file), false);
  controls.configure({ ...previous, mouseEnabled: false, fullShortcut: "Ctrl+Alt+F8", prompt: "自定义提示词" });
  assert.deepEqual([...registered.keys()], ["Ctrl+Alt+F8", previous.regionShortcut]);
  const saved = JSON.parse(fs.readFileSync(controls.file, "utf8"));
  assert.equal(saved.fullShortcut, "Ctrl+Alt+F8");
  assert.equal(saved.prompt, "自定义提示词");
  assert.equal(saved.mouseEnabled, false);
  assert.equal(saved.showCaptureHints, false);
  controls.configure({ ...controls.settings, showCaptureHints: true });
  assert.equal(JSON.parse(fs.readFileSync(controls.file, "utf8")).showCaptureHints, false);
});

for (const showCaptureHints of [undefined, false, true]) {
  test(`忽略旧提示参数 ${showCaptureHints}，选区和截图成功或失败均不显示窗口`, async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-capture-feedback-"));
    let visible = true, shown = 0, overlays = 0;
    const window = {
      isVisible: () => visible, isDestroyed: () => false,
      hide: () => { visible = false; }, showInactive: () => { shown++; visible = true; },
    };
    const receiver = { clientId: "test-receiver" };
    const delivered = [];
    const controls = new CaptureControls({
      globalShortcut: { register: () => true, unregister: () => {}, setSuspended: () => {} },
      screen: { getCursorScreenPoint: () => ({ x: 10, y: 10 }), getDisplayNearestPoint: () => ({ id: 1 }) },
    }, directory, {
      native: { permission: () => "granted", capture: async () => ({ image: "data:image/jpeg;base64,dGVzdA==", width: 10, height: 10 }) },
      runtime: { ready: true }, getWindow: () => window, legacyDirectory: path.join(directory, "no-legacy"),
      gateway: { delivery: {
        status: () => ({ ready: true }), target: () => receiver,
        send: async (...args) => { delivered.push(args); return { success: true, name: "测试手机" }; },
      } },
    });
    controls.settings = { ...controls.settings, mouseEnabled: false, showCaptureHints };
    controls.overlay = { show: () => overlays++, close: () => {} };
    controls.createGesture();
    t.after(() => { controls.close(); fs.rmSync(directory, { recursive: true, force: true }); });
    controls.gesture.arm();
    controls.cancel();
    assert.equal(overlays, 0);
    assert.equal(shown, 0);
    await controls.capture("full");
    assert.equal(visible, false);
    assert.equal(shown, 0);
    assert.equal(delivered[0][3], undefined);
    visible = true;
    shown = 0;
    controls.native.capture = async () => { throw new Error("本机截屏失败"); };
    await assert.rejects(controls.capture("full"), /截屏失败/);
    assert.equal(visible, false);
    assert.equal(shown, 0);
    assert.equal(controls.error, true);
  });
}
