const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const { NodeRuntime } = require("../desktop/node-runtime.cjs");
function harness(options = {}) {
  const child = new EventEmitter(); child.messages = []; child.kills = 0;
  child.postMessage = value => child.messages.push(value); child.kill = () => child.kills++;
  let now = 0; const timers = new Map(); let next = 0;
  const clock = { setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
    setInterval: (fn, ms) => { const id = ++next; timers.set(id, { fn, ms, interval: true }); return id; }, clearInterval: id => timers.delete(id) };
  const runtime = new NodeRuntime(path.resolve(".test-data/fake-node"), { electron: { utilityProcess: { fork: () => child } }, secretOperation: async () => null,
    timers: clock, now: () => now, ...options });
  const fire = ms => { now += ms; for (const [id, timer] of [...timers]) if (timer.ms <= ms) { if (!timer.interval) timers.delete(id); timer.fn(); } };
  const ready = () => child.emit("message", { protocolVersion: 1, type: "ready", host: "127.0.0.1", port: 24000, schemaVersion: 1, apiVersion: 1 });
  return { runtime, child, fire, ready, timers };
}
test("Runtime facade defaults to Node and rejects removed engines", () => {
  const { Runtime } = require("../desktop/runtime.cjs");
  assert.throws(() => new Runtime("unused", { engine: "legacy" }), /仅支持 Node/);
  const node = new Runtime(path.resolve(".test-data/normal-node"), { engine: "node" });
  assert.equal(node.kind, "node");
  assert.equal(node.directory, path.resolve(".test-data/normal-node"));
});
test("main already migrated source is not run a second time in NodeRuntime", async () => {
  const fs = require("node:fs"), os = require("node:os");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-main-migrated-"));
  try {
    fs.mkdirSync(path.join(directory, "chat-node/v1"), { recursive: true });
    const source = path.join(directory, "old");
    fs.mkdirSync(path.join(source, "open-webui"), { recursive: true });
    fs.writeFileSync(path.join(source, "open-webui/webui.db"), "synthetic fixture");
    const h = harness();
    h.runtime.directory = directory;
    h.runtime.options.legacySource = null;
    process.env.SNAP_MIGRATION_SOURCE = source;
    try {
      const starting = h.runtime.start();
      assert.equal(h.runtime.preparingMigration, undefined);
      h.child.emit("spawn"); h.ready(); await starting;
      assert.equal(h.child.messages[0].legacySource, null);
    } finally {
      delete process.env.SNAP_MIGRATION_SOURCE;
      const stopping = h.runtime.stop();
      h.child.emit("message", { protocolVersion: 1, type: "stopped" });
      h.child.emit("exit", 0);
      await stopping;
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("Node lifecycle waits for validated ready; clean stop needs ack and exit; credentials never use CLI", async () => {
  const { runtime, child, ready, timers } = harness();
  const starting = runtime.start(); assert.equal(runtime.ready, false); child.emit("spawn");
  assert.equal(child.messages[0].type, "initialize"); assert.ok(child.messages[0].credential.length >= 32);
  ready(); await starting; assert.equal(runtime.ready, true);
  const stopping = runtime.stop(); assert.equal(runtime.ready, false);
  child.emit("message", { protocolVersion: 1, type: "stopped" }); child.emit("exit", 0); await stopping;
  assert.equal(runtime.error, ""); assert.equal(timers.size, 0);
});
test("init timeout, mismatched protocol and unacknowledged exit never appear ready", async () => {
  for (const trigger of [h => h.fire(12000), h => h.child.emit("message", { protocolVersion: 2, type: "ready" }), h => h.child.emit("exit", 0)]) {
    const h = harness(), starting = h.runtime.start(); const rejected = assert.rejects(starting);
    trigger(h); await rejected; assert.equal(h.runtime.ready, false); assert.ok(h.runtime.error);
  }
});
test("nonce heartbeat catches channel failure even while PID is alive; stale pong fails closed", async () => {
  for (const mismatch of [false, true]) {
    const h = harness(), starting = h.runtime.start(); h.child.emit("spawn"); h.ready(); await starting;
    h.fire(1000); const ping = h.child.messages.find(m => m.type === "ping"); assert.ok(ping);
    if (mismatch) h.child.emit("message", { protocolVersion: 1, type: "pong", nonce: "stale-pid-reuse" });
    else h.fire(6001);
    assert.equal(h.runtime.ready, false); assert.ok(h.child.kills > 0);
  }
});
test("shutdown timeout forces kill and remains bounded", async () => {
  const h = harness(), starting = h.runtime.start(); h.child.emit("spawn"); h.ready(); await starting;
  const stopping = h.runtime.stop(); h.fire(5000); assert.equal(h.child.kills, 1); h.child.emit("exit", 1); await stopping;
  assert.ok(h.runtime.error);
});
test("a forced kill without observed exit is reported as unconfirmed shutdown", async () => {
  const h = harness(), starting = h.runtime.start(); h.child.emit("spawn"); h.ready(); await starting;
  const stopping = h.runtime.stop(), rejected = assert.rejects(stopping, { code: "INTERRUPTED" });
  h.fire(5000); h.fire(1500); await rejected; assert.ok(h.runtime.error);
});
