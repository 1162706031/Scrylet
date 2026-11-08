const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { validateInitialize, isShutdown } = require("./compat/protocol.cjs");

test("隔离 utilityProcess 实验拒绝协议漂移、非法数据目录及非 loopback 模型地址", () => {
  const value = { protocolVersion: 1, type: "initialize", mode: "probe", directory: path.resolve(".test-data/compat"),
    parentPid: 1234, baseURL: "http://127.0.0.1:12345/v1", secret: "fixture-not-a-real-secret" };
  assert.equal(validateInitialize(value), value);
  for (const change of [{ protocolVersion: 2 }, { type: "run-sql" }, { mode: "shell" }, { directory: "relative" },
    { directory: "bad\0path" }, { parentPid: -1 }, { secret: "" }, { baseURL: "https://example.com/v1" },
    { baseURL: "http://127.0.0.1:12345/v1?key=fixture" }, { baseURL: "http://fixture:secret@127.0.0.1:12345/v1" }])
    assert.throws(() => validateInitialize({ ...value, ...change }), /COMPAT_INITIALIZE_INVALID/);
  assert.equal(isShutdown({ protocolVersion: 1, type: "shutdown" }), true);
  assert.equal(isShutdown({ protocolVersion: 2, type: "shutdown" }), false);
});
