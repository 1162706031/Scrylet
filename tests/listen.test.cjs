const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  net = require("node:net"),
  { EventEmitter } = require("node:events");
const { listenAutomatic } = require("../service/listen.cjs");
test("automatic service binding recovers from a real occupied port without losing its listener", async (t) => {
  const occupied = net.createServer(),
    server = net.createServer((socket) => socket.end("ready"));
  await new Promise((resolve) => occupied.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    for (const current of [server, occupied])
      if (current.listening)
        await new Promise((resolve) => current.close(resolve));
  });
  let first = true;
  await listenAutomatic(server, {
    selectPort: () => {
      if (first) {
        first = false;
        return occupied.address().port;
      }
      return 0;
    },
  });
  assert.notEqual(server.address().port, occupied.address().port);
  const body = await new Promise((resolve, reject) => {
    const socket = net.connect(server.address().port, "127.0.0.1");
    let text = "";
    socket.on("data", (bytes) => (text += bytes));
    socket.once("end", () => resolve(text));
    socket.once("error", reject);
  });
  assert.equal(body, "ready");
});
test("Windows excluded-port failures stay bounded; other permissions fail immediately", async () => {
  for (const [platform, expected] of [
    ["win32", 3],
    ["darwin", 1],
  ]) {
    const server = new EventEmitter();
    let calls = 0;
    server.listen = () => {
      calls++;
      queueMicrotask(() =>
        server.emit(
          "error",
          Object.assign(Error("synthetic excluded port"), { code: "EACCES" }),
        ),
      );
      return server;
    };
    await assert.rejects(listenAutomatic(server, { platform, attempts: 3 }), {
      code: "EACCES",
    });
    assert.equal(calls, expected);
    assert.equal(server.listenerCount("error"), 0);
    assert.equal(server.listenerCount("listening"), 0);
  }
});
