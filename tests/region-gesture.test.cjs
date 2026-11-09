const test = require("node:test");
const assert = require("node:assert/strict");
const { RegionGesture } = require("../desktop/region-gesture.cjs");
const { validateSettings, defaults } = require("../desktop/capture-settings.cjs");
const path = require("node:path");

function fixture(t, extra = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 100 });
  const changes = [], regions = [], doubles = [];
  const gesture = new RegionGesture({
    holdMs: 1200, timeoutMs: 5000,
    onChange: (value) => changes.push(value),
    onRegion: (...value) => regions.push(value),
    onDoubleClick: () => doubles.push(true), ...extra,
  });
  t.after(() => gesture.cancel());
  return { gesture, changes, regions, doubles, tick: (time) => t.mock.timers.tick(time) };
}

test("两个稳定长按选定角点，第二次释放时只截图一次", (t) => {
  const { gesture, regions, tick } = fixture(t);
  gesture.down({ x: -100, y: 50 });
  tick(1199);
  assert.equal(gesture.phase, "idle");
  tick(1);
  assert.equal(gesture.phase, "release-first");
  tick(1500);
  assert.equal(regions.length, 0);
  gesture.up();
  tick(4900);
  gesture.down({ x: 500, y: 450 });
  tick(1200);
  assert.equal(regions.length, 0);
  gesture.up();
  gesture.up();
  assert.deepEqual(regions, [[{ x: -100, y: 50 }, { x: 500, y: 450 }]]);
  assert.equal(gesture.phase, "idle");
});

test("超时恢复默认，短按不能延长第二个角的五秒等待", (t) => {
  const { gesture, regions, changes, tick } = fixture(t);
  gesture.down({ x: 0, y: 0 }); tick(1200); gesture.up();
  tick(4000);
  gesture.down({ x: 200, y: 200 }); tick(100); gesture.up();
  tick(901);
  assert.equal(gesture.phase, "idle");
  assert.match(changes.at(-1).message, /超时/);
  gesture.down({ x: 200, y: 200 }); tick(1200); gesture.up();
  assert.equal(gesture.phase, "second");
  assert.equal(regions.length, 0);
});

test("拖动、短按和取消都不会截图；双击可独立开启", (t) => {
  const { gesture, regions, doubles, tick } = fixture(t, { doubleMs: 500 });
  gesture.down({ x: 20, y: 30 });
  gesture.move({ x: 200, y: 30 }); tick(2000); gesture.up();
  assert.equal(gesture.phase, "idle");
  gesture.down({ x: 20, y: 30 }); tick(50); gesture.up();
  tick(150);
  gesture.down({ x: 20, y: 30 }); tick(50); gesture.up();
  assert.equal(doubles.length, 1);
  gesture.arm(); gesture.down({ x: 20, y: 30 }); tick(1200);
  gesture.cancel(); gesture.up(); tick(6000);
  assert.equal(gesture.phase, "idle");
  assert.equal(regions.length, 0);
});
test("仅开启双击时，长按不会进入区域手势", (t) => {
  const { gesture, doubles, tick } = fixture(t, { doubleMs: 500, holdEnabled: false });
  gesture.down({ x: 20, y: 30 }); tick(1200); gesture.up();
  assert.equal(gesture.phase, "idle");
  gesture.down({ x: 20, y: 30 }); tick(40); gesture.up();
  gesture.down({ x: 20, y: 30 }); tick(40); gesture.up();
  assert.equal(doubles.length, 1);
  gesture.arm(); gesture.down({ x: 20, y: 30 }); tick(1200);
  assert.equal(gesture.phase, "release-first");
});

test("截图设置拒绝重复快捷键、无效按键和越界时长", () => {
  const settings = defaults(path.join(__dirname, "no-legacy"));
  assert.equal(validateSettings(settings).holdMs, 1200);
  assert.throws(() => validateSettings({ ...settings, regionShortcut: "Control+Alt+S" }), /不能相同/);
  assert.throws(() => validateSettings({ ...settings, mouseButton: "unknown" }), /鼠标/);
  assert.throws(() => validateSettings({ ...settings, holdMs: 0 }), /范围/);
  assert.throws(() => validateSettings({ ...settings, prompt: " " }), /提示词/);
});

test("等待第二个角时拖动，仍按原截止时间取消，且不会留下旧计时器", (t) => {
  const { gesture, tick } = fixture(t);
  gesture.down({ x: 10, y: 10 }); tick(1200); gesture.up();
  tick(1000);
  gesture.down({ x: 40, y: 40 });
  gesture.move({ x: 100, y: 100 }); tick(100);
  gesture.move({ x: 120, y: 120 });
  tick(3901);
  assert.equal(gesture.phase, "idle");
  gesture.down({ x: 10, y: 10 }); tick(1200); gesture.up();
  tick(500);
  assert.equal(gesture.phase, "second");
});
