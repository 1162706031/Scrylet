const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");
const base = path.resolve(".test-data/node-service-m1"); fs.mkdirSync(base, { recursive: true });
const run = fs.mkdtempSync(path.join(base, "run-"));
const entry = path.resolve("tests/service/main.cjs");
function start(directory, hold = false, entryFile = entry) {
  fs.mkdirSync(directory, { recursive: true });
  const env = { ...process.env, SNAP_SERVICE_TEST_DIR: directory, SNAP_SERVICE_TEST_HOLD: hold ? "1" : "0" };
  delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; delete env.NODE_PATH;
  for (const p of require("../config/providers.json").providers) delete env[p.envKey];
  const child = spawn(require("electron"), [entryFile], { env, cwd: directory, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  const log = fs.createWriteStream(path.join(directory, "process.log")); child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
  child.once("exit", () => log.end()); return child;
}
async function waitFor(fn, timeout = 15000) { const until = Date.now() + timeout; while (!fn()) { if (Date.now() > until) throw Error("SERVICE_TEST_TIMEOUT"); await delay(50); } }
(async () => {
  const directory = path.join(run, "normal"), child = start(directory);
  await waitFor(() => child.exitCode !== null, 120000);
  const result = JSON.parse(fs.readFileSync(path.join(directory, "result.json"), "utf8"));
  assert.equal(result.status, "passed", result.code + " " + (result.location || []).join(" ")); assert.equal(child.exitCode, 0);
  const held = path.join(run, "parent-kill"), parent = start(held, true);
  try {
    await waitFor(() => fs.existsSync(path.join(held, "held.json")));
    const { parentPid, childPid } = JSON.parse(fs.readFileSync(path.join(held, "held.json"), "utf8"));
    if (process.platform === "win32") spawnSync("taskkill.exe", ["/PID", String(parentPid), "/F"], { stdio: "ignore" });
    else process.kill(parentPid, "SIGKILL");
    await waitFor(() => { try { process.kill(childPid, 0); return false; } catch (error) { if (error.code === "ESRCH") return true; throw error; } }, 9000);
    result.checks.push("parent-only-kill-child-exits");
  } finally { if (parent.exitCode === null) parent.kill(); }
  if (process.argv.includes("--asar")) {
    const archive = await require("./service-test-asar.cjs").serviceTestArchive(path.resolve(__dirname, ".."), run);
    const temporary = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "scrylet-service-"));
    try {
      const external = path.join(temporary, "独立 有空格.路径"); fs.mkdirSync(external);
      const file = path.join(external, "app.asar"); fs.copyFileSync(archive.file, file);
      const data = path.join(external, "包外数据"), packaged = start(data, false, file);
      try { await waitFor(() => packaged.exitCode !== null, 120000); }
      finally { if (packaged.exitCode === null) packaged.kill(); }
      fs.cpSync(data, path.join(run, "asar-evidence"), { recursive: true });
      const verified = JSON.parse(fs.readFileSync(path.join(data, "result.json"), "utf8"));
      assert.equal(verified.status, "passed", verified.code + " " + (verified.location || []).join(" "));
      assert.equal(packaged.exitCode, 0); assert.equal(verified.entryInAsar, true); assert.equal(verified.appPathInAsar, true);
      result.archive = { ...archive, file: path.relative(process.cwd(), archive.file), checks: verified.checks, outsideRepository: true, differentCwd: true, nodePathCleared: true };
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  }
  fs.writeFileSync(path.join(run, "report.json"), JSON.stringify({ ...result, run: path.relative(process.cwd(), run) }, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: result.checks, run: path.relative(process.cwd(), run) }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
