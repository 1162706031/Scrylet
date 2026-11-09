const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { Appearance, themes } = require("../desktop/appearance.cjs");
const { Gateway } = require("../desktop/gateway.cjs");
const { validate } = require("../contracts/validate.cjs");
function directory(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-appearance-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("外观契约只接受固定主题、版本和字段", () => {
  for (const theme of themes) validate("appearance", { apiVersion: 1, themeId: theme.id, revision: 0 });
  for (const change of [{ themeId: "unknown" }, { themeId: "url(javascript:alert(1))" }, { apiVersion: 2 }, { css: "arbitrary" }, { themeId: null }])
    assert.throws(() => validate("appearanceChange", { apiVersion: 1, themeId: "forest", ...change }), { code: "INVALID_CONTRACT" });
  for (const revision of [-1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => validate("appearance", { apiVersion: 1, themeId: "forest", revision }));
});
test("主题保存独立、原子且可重启读取；重复选择不增加修订", t => {
  const dir = directory(t), prefs = new Appearance(dir);
  assert.deepEqual(prefs.snapshot(), { apiVersion: 1, themeId: "forest", revision: 0 });
  assert.equal(fs.existsSync(path.join(dir, "appearance.json")), false);
  for (const [index, theme] of themes.slice(1).entries()) {
    const next = prefs.save({ apiVersion: 1, themeId: theme.id });
    assert.equal(next.revision, index + 1);
    assert.deepEqual(new Appearance(dir).snapshot(), next);
    assert.deepEqual(prefs.save({ apiVersion: 1, themeId: theme.id }), next);
  }
  const bytes = fs.readFileSync(prefs.file);
  assert.throws(() => prefs.save({ apiVersion: 1, themeId: "bad" }));
  assert.deepEqual(fs.readFileSync(prefs.file), bytes);
  assert.deepEqual(fs.readdirSync(dir), ["appearance.json"]);
});
test("配置损坏时保留原字节并回退默认；落盘失败不切换当前主题", t => {
  const dir = directory(t), file = path.join(dir, "appearance.json");
  fs.writeFileSync(file, "damaged-preference");
  const prefs = new Appearance(dir);
  assert.equal(prefs.snapshot().themeId, "forest");
  assert.equal(fs.readFileSync(file, "utf8"), "damaged-preference");
  t.mock.method(fs, "renameSync", () => { throw new Error("private path must not be exposed"); });
  assert.throws(() => prefs.save({ apiVersion: 1, themeId: "midnight" }), error => error.code === "STORAGE_FAILED" && !error.message.includes("private"));
  assert.equal(prefs.snapshot().themeId, "forest");
  assert.equal(fs.readFileSync(file, "utf8"), "damaged-preference");
});
test("配色元数据可用于配对和暂停页面；HTTP 不能写入且拒绝跨站", async t => {
  const dir = directory(t), gateway = new Gateway(dir, {}, { ready: false });
  await gateway.start(); t.after(() => gateway.close());
  const url = `http://127.0.0.1:${gateway.port}/snap/appearance`;
  for (const paused of [false, true]) {
    gateway.pause(paused);
    const value = gateway.appearance.save({ apiVersion: 1, themeId: paused ? "midnight" : "ocean" });
    const response = await fetch(url);
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), value);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const denied = await fetch(url, { method, headers: { "Content-Type": "application/json", "X-Snap-Client": "mobile" }, body: JSON.stringify({ apiVersion: 1, themeId: "clay" }) });
      assert.equal(denied.status, 405);
    }
    assert.deepEqual(gateway.appearance.snapshot(), value);
  }
  assert.equal((await fetch(url, { headers: { Origin: "https://other.invalid" } })).status, 403);
  assert.equal((await fetch(`http://127.0.0.1:${gateway.port}/snap/api/status`)).status, 401);
});
