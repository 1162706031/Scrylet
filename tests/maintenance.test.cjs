const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ActivityLog, reasonFor } = require("../desktop/activity-log.cjs");
const { Maintenance } = require("../desktop/maintenance.cjs");
const { runtimePaths } = require("../desktop/runtime-paths.cjs");

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "snap-maintenance-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return directory;
}

test("操作日志重启后可读取，且不会记录密钥、URL、图片、正文或任意错误字符串", (t) => {
  const directory = temporary(t);
  const log = new ActivityLog(directory);
  const secret = "test-private-key-must-never-appear";
  log.record("capture.sent", {
    origin: "desktop", mode: "region", width: 640, height: 480,
    apiKey: secret, prompt: secret, image: secret, url: secret, body: secret, error: secret,
  });
  log.record("capture.failed", { reason: reasonFor(new Error(secret)) });
  assert.equal(log.record(secret, { apiKey: secret }), false);
  assert.equal(fs.readFileSync(log.file, "utf8").includes(secret), false);
  const reloaded = new ActivityLog(directory).list();
  assert.equal(reloaded.entries.length, 2);
  assert.equal(reloaded.entries[1].message, "截图与提示词已提交到手机聊天");
  assert.deepEqual(reloaded.entries[1].metadata, { width: 640, height: 480, origin: "desktop", mode: "region" });
  fs.appendFileSync(log.file, "not valid json\n" + JSON.stringify({
    event: "capture.sent", at: new Date().toISOString(), message: secret, metadata: { apiKey: secret },
  }) + "\n");
  assert.equal(JSON.stringify(log.list()).includes(secret), false);
  assert.equal(log.list().entries.length, 3);
});

test("日志轮换限制磁盘占用，读取仍按最近操作排序", (t) => {
  const directory = temporary(t);
  const log = new ActivityLog(directory, { maxBytes: 400, archives: 2 });
  for (let index = 0; index < 40; index++) log.record("capture.completed", { width: index, height: 480 });
  assert.equal(fs.readdirSync(log.directory).length, 3);
  const entries = log.list().entries;
  assert.equal(entries[0].metadata.width, 39);
  assert.ok(entries.length < 40 && entries.length > 0);
});

test("清理缓存保留聊天、密钥、配对、设置及日志，并拒绝同时执行第二次清理", async (t) => {
  const directory = temporary(t);
  const code = path.join(directory, "Code Cache");
  fs.mkdirSync(code);
  fs.writeFileSync(path.join(code, "temporary.bin"), "cache");
  const protectedFiles = ["webui.db", "devices.json", "capture-settings.json", "runtime-secret.json", "attachment.jpg"];
  for (const name of protectedFiles) fs.writeFileSync(path.join(directory, name), "protected-" + name);
  const log = new ActivityLog(directory);
  log.record("app.started");
  let httpBytes = 1024;
  let release;
  const waiting = new Promise((resolve) => { release = resolve; });
  const session = {
    getCacheSize: async () => httpBytes,
    clearCache: async () => { await waiting; httpBytes = 0; },
    clearCodeCaches: async () => fs.rmSync(code, { recursive: true }),
    clearStorageData: () => { throw new Error("Persistent storage must not be cleared"); },
  };
  const maintenance = new Maintenance(session, directory, log);
  const first = maintenance.clearCache();
  await assert.rejects(maintenance.clearCache(), /正在清理/);
  release();
  const result = await first;
  assert.equal(result.bytes, 1029);
  assert.equal(result.remainingBytes, 0);
  for (const name of protectedFiles) assert.equal(fs.readFileSync(path.join(directory, name), "utf8"), "protected-" + name);
  assert.equal(log.list().entries[0].event, "cache.cleared");
  assert.equal(log.list().entries[1].event, "app.started");
});

test("缓存清理失败可重试，错误不会回显私密诊断内容", async (t) => {
  const directory = temporary(t);
  const log = new ActivityLog(directory);
  const session = {
    getCacheSize: async () => 0,
    clearCache: async () => { throw new Error("test-private-runtime-secret"); },
    clearCodeCaches: async () => {},
  };
  const maintenance = new Maintenance(session, directory, log);
  await assert.rejects(maintenance.clearCache(), /缓存未能全部清理/);
  assert.equal(maintenance.clearing, false);
  assert.equal(JSON.stringify(log.list()).includes("test-private-runtime-secret"), false);
  session.clearCache = async () => {};
  assert.equal((await maintenance.clearCache()).success, true);
});

test("安装版的 Python 和脚本位于资源目录，不依赖开发虚拟环境或 ASAR 内的可执行文件", () => {
  const resources = path.join(os.tmpdir(), "Snap Solver installed", "resources");
  const bundled = runtimePaths({ root: path.join(resources, "app.asar"), resourcesPath: resources, platform: "win32", pythonOverride: "" });
  assert.equal(bundled.packaged, true);
  assert.equal(bundled.python, path.join(resources, "python/python.exe"));
  assert.equal(bundled.launcher, path.join(resources, "runtime/launch.py"));
  assert.equal(bundled.mouse, path.join(resources, "runtime/mouse-input.py"));
  assert.equal(bundled.launcher.includes("app.asar"), false);
  const source = runtimePaths({ root: path.join(os.tmpdir(), "source"), resourcesPath: resources, platform: "win32", pythonOverride: "" });
  assert.equal(source.python, path.join(os.tmpdir(), "source/.runtime/Scripts/python.exe"));
  assert.equal(source.packaged, false);
});
