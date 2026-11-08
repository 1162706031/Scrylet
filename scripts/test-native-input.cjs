const fs = require("node:fs"),
  path = require("node:path");
const { spawn, fork, spawnSync } = require("node:child_process");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const assert = require("node:assert/strict");
const { MouseInput } = require("../desktop/mouse-input.cjs");
const { input, assertInputDesktopUnused } = require("./windows-input.cjs");
const root = path.resolve(__dirname, "..");
async function until(fn, timeout = 4000) {
  const end = Date.now() + timeout;
  while (!(await fn())) {
    if (Date.now() > end) throw Error("NATIVE_ACCEPTANCE_TIMEOUT");
    await delay(15);
  }
}
function gone(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
    return true;
  }
}
async function main() {
  assertInputDesktopUnused();
  const directory = fs.mkdtempSync(
    path.join(root, ".test-data/node-service-m3/native-"),
  );
  const report = {
    platform: process.platform,
    arch: process.arch,
    syntheticSystemInput: true,
    physicalInput: false,
    checks: [],
  };
  const events = [],
    errors = [];
  const mouse = new MouseInput(
    (event) => events.push(event),
    (error) => errors.push(error),
  );
  // Use Electron's real screen coordinate conversion only for saving/restoring
  // cursor state. This entry observes raw physical coordinates directly.
  let original;
  try {
    const cursor = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Add-Type -AssemblyName System.Windows.Forms; $p=[System.Windows.Forms.Cursor]::Position; Write-Output ($p.X.ToString()+','+$p.Y.ToString())",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    if (cursor.status !== 0) throw Error("CURSOR_SNAPSHOT_FAILED");
    const [x, y] = cursor.stdout.trim().split(",").map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y))
      throw Error("CURSOR_SNAPSHOT_FAILED");
    original = { x, y };
    for (const button of ["left", "right", "middle", "x1", "x2"]) {
      events.length = 0;
      await mouse.start(button);
      await until(() => events.some((e) => e.type === "ready"));
      await input([
        "hold",
        "--button",
        button,
        "--x",
        String(x),
        "--y",
        String(y),
        "--milliseconds",
        "100",
      ]);
      await until(() => events.some((e) => e.type === "up"));
      assert.deepEqual(
        events
          .filter((e) => ["down", "up"].includes(e.type))
          .map((e) => e.type),
        ["down", "up"],
      );
      await mouse.stop();
    }
    report.checks.push(
      "five-physical-button-v1-events",
      "handshake-and-stdin-exit",
    );
    events.length = 0;
    await mouse.start("left");
    await until(() => events.some((e) => e.type === "ready"));
    await input([
      "drag",
      "--x",
      String(x),
      "--y",
      String(y),
      "--to-x",
      String(x + 40),
      "--to-y",
      String(y + 30),
      "--milliseconds",
      "200",
    ]);
    assert.ok(events.some((e) => e.type === "move"));
    await mouse.stop();
    report.checks.push("physical-motion-no-dip-double-conversion");
    const parent = fork(
      path.join(root, "tests/native/observer-parent.cjs"),
      [],
      {
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
      },
    );
    const [message] = await once(parent, "message");
    assert.ok(message.ready);
    spawnSync("taskkill.exe", ["/PID", String(parent.pid), "/F"], {
      stdio: "ignore",
    });
    await until(() => gone(message.pid));
    report.checks.push("parent-only-kill-observer-exits");
    events.length = 0;
    await mouse.start("left");
    await until(() => events.some((e) => e.type === "ready"));
    const driver = spawn(
      path.join(root, "build/native/win32-x64/test-input-driver.exe"),
      [
        "hold",
        "--x",
        String(x),
        "--y",
        String(y),
        "--milliseconds",
        "10000",
        "--parent",
        String(process.pid),
      ],
      { windowsHide: true, stdio: ["pipe", "ignore", "ignore"] },
    );
    driver.stdin.on("error", () => {});
    await until(() => events.some((e) => e.type === "down"));
    driver.kill();
    await until(() => events.some((e) => e.type === "up"));
    await mouse.stop();
    report.checks.push("forced-driver-kill-release-guardian");
    assert.deepEqual(errors, []);
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.code = error.code || error.message;
    throw error;
  } finally {
    await mouse.stop();
    if (original)
      await input([
        "move",
        "--x",
        String(original.x),
        "--y",
        String(original.y),
      ]).catch(() => {});
    fs.writeFileSync(
      path.join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({ ...report, evidence: path.relative(root, directory) }),
    );
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
