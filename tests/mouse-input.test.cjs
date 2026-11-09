const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { setTimeout: delay } = require("node:timers/promises");
const { MouseInput } = require("../desktop/mouse-input.cjs");
const ready =
  '{"protocolVersion":1,"type":"ready","coordinateSpace":"physical"}\n';
function fixture(options = {}) {
  const events = [],
    errors = [],
    children = [];
  const spawn = (_program, args) => {
    assert.ok(!args.some((arg) => /python|\.py$/i.test(arg)));
    const child = Object.assign(new EventEmitter(), {
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      exitCode: null,
      killed: false,
    });
    child.finish = () => {
      if (child.exitCode !== null) return;
      child.exitCode = 0;
      child.stdout.end();
      child.emit("exit", 0);
    };
    child.kill = () => {
      child.killed = true;
      child.finish();
    };
    if (!options.stubborn)
      child.stdin.on("finish", () => setImmediate(child.finish));
    children.push(child);
    return child;
  };
  const mouse = new MouseInput(
    (event) => events.push(event),
    (message) => errors.push(message),
    {
      spawn,
      program: () => "isolated-observer",
      platform: options.platform || "win32",
      arch: options.arch || "x64",
      handshakeTimeout: 30,
      stopTimeout: 20,
    },
  );
  return { mouse, events, errors, children };
}
test("native reader accepts split/multiple lines only after physical v1 handshake; stop drains process", async () => {
  const f = fixture();
  await f.mouse.start("left");
  const c = f.children[0];
  c.stdout.write(ready.slice(0, 20));
  c.stdout.write(
    ready.slice(20) + '{"protocolVersion":1,"type":"down","x":-320,"y":240}\n',
  );
  assert.deepEqual(
    f.events.map((e) => e.type),
    ["ready", "down"],
  );
  await f.mouse.stop();
  assert.equal(c.exitCode, 0);
  assert.deepEqual(f.errors, []);
  assert.equal(f.mouse.child, null);
});
test("Mac observer accepts DIP handshake and stays read-only across lifecycle", async () => {
  const f = fixture({ platform: "darwin", arch: "arm64" });
  await f.mouse.start("x1");
  assert.equal(f.children.length, 1);
  f.children[0].stdout.write('{"protocolVersion":1,"type":"ready","coordinateSpace":"dip"}\n');
  f.children[0].stdout.write('{"protocolVersion":1,"type":"down","x":-100,"y":80}\n');
  assert.deepEqual(f.events.map(event => event.type), ["ready", "down"]);
  assert.equal(f.events[0].coordinateSpace, "dip");
  await f.mouse.stop();
  assert.deepEqual(f.errors, []);
});
for (const [label, content] of [
  ["before-ready", '{"protocolVersion":1,"type":"cancel"}\n'],
  ["unknown", ready + '{"protocolVersion":1,"type":"inject"}\n'],
  [
    "wrong-version",
    ready.replace('"protocolVersion":1', '"protocolVersion":2'),
  ],
  ["duplicate-ready", ready + ready],
  ["oversized", "x".repeat(1025)],
])
  test("native protocol fails closed: " + label, async () => {
    const f = fixture();
    await f.mouse.start("x2");
    f.children[0].stdout.write(content);
    await f.mouse.stop();
    assert.equal(f.errors.length, 1);
    assert.equal(f.mouse.child, null);
  });
test("native reader rejects truncated EOF and handshake timeout; bounded stop kills a stubborn process", async () => {
  const f = fixture();
  await f.mouse.start("middle");
  f.children[0].stdout.write(ready + '{"protocolVersion":1');
  f.children[0].stdout.end();
  await delay(5);
  await f.mouse.stop();
  assert.equal(f.errors.length, 1);
  const stuck = fixture({ stubborn: true });
  await stuck.mouse.start("right");
  await delay(80);
  assert.equal(stuck.errors.length, 1);
  assert.equal(stuck.children[0].killed, true);
  await stuck.mouse.stop();
});
test("rapid reconfiguration never spawns stale observer; unsupported platform and missing binary do not fall back", async () => {
  const f = fixture();
  const old = f.mouse.start("left"),
    current = f.mouse.start("right");
  await Promise.all([old, current]);
  assert.equal(f.children.length, 1);
  await f.mouse.stop();
  let spawned = false;
  const mouse = new MouseInput(
    () => {},
    () => {},
    {
      platform: "linux",
      spawn: () => {
        spawned = true;
      },
    },
  );
  await mouse.start("left");
  assert.equal(spawned, false);
  const errors = [];
  const absent = new MouseInput(
    () => {},
    (m) => errors.push(m),
    {
      platform: "win32",
      arch: "x64",
      program: () => {
        throw Error("ENOENT");
      },
      spawn: () => {
        spawned = true;
      },
    },
  );
  await absent.start("left");
  assert.equal(errors.length, 1);
  assert.equal(spawned, false);
});
