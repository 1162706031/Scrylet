const fs = require("node:fs"),
  path = require("node:path"),
  { spawn } = require("node:child_process"),
  { setTimeout: delay } = require("node:timers/promises");
async function main() {
  const root = path.resolve(__dirname, ".."),
    base = path.join(root, ".test-data/node-service-m4");
  fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "run-")),
    env = { ...process.env, SNAP_MIGRATION_TEST_DIR: directory };
  for (const k of [
    "NODE_OPTIONS",
    "NODE_PATH",
    "ELECTRON_RUN_AS_NODE",
    "SNAP_MIGRATION_SOURCE",
    "SNAP_RUNTIME_ENGINE",
  ])
    delete env[k];
  for (const p of require("../config/providers.json").providers)
    delete env[p.envKey];
  const output = fs.createWriteStream(path.join(directory, "process.log")),
    child = spawn(
      require("electron"),
      [path.join(root, "tests/migration/main.cjs")],
      {
        env,
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  child.once("exit", () => output.end());
  const end = Date.now() + 570000;
  while (child.exitCode === null) {
    if (Date.now() > end) {
      child.kill();
      throw Error("MIGRATION_TEST_TIMEOUT");
    }
    await delay(50);
  }
  const report = JSON.parse(
    fs.readFileSync(path.join(directory, "report.json")),
  );
  if (child.exitCode !== 0 || report.status !== "passed")
    throw Error(
      JSON.stringify({
        code: report.code || "MIGRATION_TEST_FAILED",
        check: report.checks?.length,
        evidence: path.relative(root, directory),
        location: report.location,
      }),
    );
  for (const [kind, data] of [
    ["target", report.target],
    ["node-snapshot", path.join(report.rollbackDirectory, "node-snapshot")],
  ]) {
    const output = path.join(directory, kind + "-reopen.json"),
      reopened = spawn(
        require("electron"),
        [path.join(root, "tests/migration/reopen.cjs")],
        {
          env: {
            ...env,
            SNAP_MIGRATION_REOPEN_DIR: data,
            SNAP_MIGRATION_REOPEN_REPORT: output,
          },
          cwd: directory,
          stdio: "ignore",
          windowsHide: true,
        },
      );
    const until = Date.now() + 30000;
    while (reopened.exitCode === null) {
      if (Date.now() > until) {
        reopened.kill();
        throw Error("MIGRATION_REOPEN_TIMEOUT");
      }
      await delay(50);
    }
    if (
      reopened.exitCode !== 0 ||
      JSON.parse(fs.readFileSync(output)).status !== "passed"
    )
      throw Error("MIGRATION_REOPEN_FAILED: " + kind);
    report.checks.push("real-process-reopen-OS-secret-" + kind);
  }
  report.processCrashes = [];
  for (const stage of [
    "inspected",
    "snapshotted",
    "files",
    "data",
    "validated",
    "activated",
  ]) {
    const target = path.join(directory, "process-crash-" + stage);
    for (const [phase, point, expected] of [
      ["exit", stage, 93],
      ["resume", "none", 0],
    ]) {
      const resultFile = path.join(
        directory,
        "process-" + stage + "-" + phase + ".json",
      );
      const log = fs.openSync(resultFile + ".log", "w");
      const result = require("node:child_process").spawnSync(
        require("electron"),
        [path.join(root, "tests/migration/crash.cjs")],
        {
          env: {
            ...env,
            SNAP_CRASH_SOURCE: path.join(directory, "legacy"),
            SNAP_CRASH_TARGET: target,
            SNAP_CRASH_STAGE: point,
            SNAP_CRASH_REPORT: resultFile,
          },
          cwd: directory,
          stdio: ["ignore", log, log],
          timeout: 30000,
        },
      );
      fs.closeSync(log);
      if (result.status !== expected)
        throw Error(
          "MIGRATION_PROCESS_CHECKPOINT_FAILED: " + stage + " " + phase,
        );
      const proof = JSON.parse(fs.readFileSync(resultFile));
      if (
        phase === "resume" &&
        (proof.status !== "passed" || proof.osSecretReadable !== true)
      )
        throw Error("MIGRATION_PROCESS_RECOVERY_FAILED");
    }
    report.processCrashes.push(stage);
    report.checks.push("real-process-exit-resume-with-OS-secret-" + stage);
  }
  fs.writeFileSync(
    path.join(directory, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      checks: report.checks.length,
      evidence: path.relative(root, directory),
    }),
  );
  return report;
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main };
