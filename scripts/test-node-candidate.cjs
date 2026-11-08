// Local acceptance orchestration; no release, account access or user-data cleanup.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
function main(argv = process.argv.slice(2)) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("候选验收需要真实 Windows x64");
  let executable = path.join(
      root,
      "build/node-win-x64-release/output/win-unpacked/Scrylet.exe",
    ),
    nativeOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--native-only") nativeOnly = true;
    else if (argv[i] === "--executable" && argv[i + 1])
      executable = path.resolve(argv[++i]);
    else throw Error("CANDIDATE_ARGUMENTS");
  }
  const directory = fs.mkdtempSync(
      path.join(root, ".test-data/node-service-m5/acceptance-"),
    ),
    artifacts = path.join(root, "artifacts"),
    backup = path.join(directory, "original-artifacts");
  fs.mkdirSync(backup);
  const originals = fs
    .readdirSync(artifacts)
    .filter((name) => fs.statSync(path.join(artifacts, name)).isFile());
  for (const name of originals)
    fs.copyFileSync(path.join(artifacts, name), path.join(backup, name));
  const report = {
    status: "running",
    platform: process.platform,
    arch: process.arch,
    nativeOnly,
    steps: [],
    externalModelRequests: 0,
    physicalPhone: "unverified",
    evidence: path.relative(root, directory),
  };
  const write = () =>
    fs.writeFileSync(
      path.join(directory, "report.json"),
      JSON.stringify(report, null, 2),
    );
  const env = { ...process.env };
  for (const key of [
    "SNAP_TEST_EXECUTABLE",
    "ELECTRON_RUN_AS_NODE",
    "NODE_OPTIONS",
    "NODE_PATH",
  ])
    delete env[key];
  for (const provider of require("../config/providers.json").providers)
    delete env[provider.envKey];
  const run = (name, args, additional = {}) => {
    const log = fs.openSync(path.join(directory, name + ".log"), "w"),
      started = Date.now();
    let result;
    try {
      result = spawnSync(process.execPath, args, {
        cwd: root,
        env: { ...env, ...additional },
        stdio: ["ignore", log, log],
        timeout: 900000,
      });
    } finally {
      fs.closeSync(log);
    }
    report.steps.push({
      name,
      status: result.status === 0 ? "passed" : "failed",
      exitCode: result.status,
      elapsedMs: Date.now() - started,
    });
    write();
    if (result.error || result.status !== 0)
      throw Error("CANDIDATE_STEP_FAILED: " + name);
  };
  try {
    report.audit = require("./audit-package.cjs").run([
      path.dirname(executable),
      "--platform",
      "win32",
      "--arch",
      "x64",
      "--runtime",
      "node",
    ]);
    if (!nativeOnly) {
      run("check", ["scripts/check.cjs"]);
      run("unit", [
        "--test",
        ...fs
          .readdirSync(path.join(root, "tests"))
          .filter((name) => name.endsWith(".test.cjs"))
          .map((name) => "tests/" + name),
      ]);
      run("service-asar", ["scripts/test-node-service.cjs", "--asar"]);
      run("phone", [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "playwright.phone.config.cjs",
        "--output",
        path.join(directory, "phone-results"),
      ]);
      run("phone-asar", ["scripts/test-phone-asar.cjs"]);
      run("migration", ["scripts/test-migration.cjs"]);
      run("default-migration", ["scripts/smoke-default-migration.cjs"]);
    }
    run("native-observer", ["scripts/test-native-input.cjs"]);
    for (const [kind, overrides] of [
      ["source", {}],
      ["packaged", { SNAP_TEST_EXECUTABLE: executable }],
    ]) {
      run("desktop-input-" + kind, ["scripts/smoke-desktop-input.cjs"], {
        ...overrides,
        SNAP_TEST_ARTIFACT_PREFIX: "node-service-m5-input-" + kind,
      });
      run(
        "lifecycle-" + kind,
        ["scripts/test-desktop-lifecycle.cjs"],
        overrides,
      );
      run("maintenance-" + kind, ["scripts/smoke-maintenance.cjs"], overrides);
      run("network-" + kind, ["scripts/smoke-network.cjs"], overrides);
    }
    report.status = "passed-in-measured-scope";
  } catch (error) {
    report.status = "failed";
    report.code = error.message;
    process.exitCode = 1;
  } finally {
    for (const name of fs.readdirSync(artifacts)) {
      const current = path.join(artifacts, name),
        original = path.join(backup, name);
      if (!fs.statSync(current).isFile()) continue;
      const changed =
        !fs.existsSync(original) ||
        !fs.readFileSync(current).equals(fs.readFileSync(original));
      if (changed && !name.startsWith("node-service-m5-"))
        fs.copyFileSync(
          current,
          path.join(artifacts, "node-service-m5-" + name),
        );
    }
    for (const name of originals)
      fs.copyFileSync(path.join(backup, name), path.join(artifacts, name));
    report.originalArtifactsRestored = originals.length;
    write();
    console.log(JSON.stringify(report));
  }
  return report;
}
if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { main };
