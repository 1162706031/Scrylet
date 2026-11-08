// Bind local Windows evidence to one application archive. This never infers a
// production, physical-device, Mac or cold-boot pass from a partial report.
const fs = require("node:fs"),
  path = require("node:path"),
  assert = require("node:assert/strict");
const { digest } = require("./package-audit.cjs");
const { validateRelease } = require("../contracts/release.cjs");
const root = path.resolve(__dirname, "..");
function parse(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = {
      "--acceptance": "acceptance",
      "--installation": "installation",
      "--startup": "startup",
      "--package": "package",
      "--unpacked": "unpacked",
      "--installer": "installer",
    }[argv[i]];
    if (!key || !argv[i + 1]) throw Error("M5_EVIDENCE_ARGUMENTS");
    options[key] = path.resolve(argv[++i]);
  }
  for (const key of ["acceptance", "installation", "startup", "package", "unpacked", "installer"])
    if (!options[key]) throw Error("M5_EVIDENCE_ARGUMENTS");
  return options;
}
function read(file) {
  assert.ok(fs.statSync(file).isFile(), "M5_EVIDENCE_MISSING");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function publicCopy(value, name) {
  const target = path.join(root, "artifacts", name);
  fs.copyFileSync(value, target);
  return path.relative(root, target).replaceAll(path.sep, "/");
}
function main(argv = process.argv.slice(2)) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("M5 Windows 证据汇总需要真实 Windows x64");
  const options = parse(argv),
    acceptance = read(options.acceptance),
    installation = read(options.installation),
    startup = read(options.startup),
    packageSize = read(options.package);
  assert.equal(acceptance.status, "passed-in-measured-scope");
  assert.equal(acceptance.nativeOnly, false, "需要完整候选验收，不能用 --native-only 代替");
  const requiredSteps = [
    "check", "unit", "service-asar", "phone", "phone-asar", "migration",
    "default-migration", "native-observer",
    ...["source", "packaged"].flatMap(kind => [
      `desktop-input-${kind}`, `lifecycle-${kind}`, `maintenance-${kind}`, `network-${kind}`,
    ]),
  ];
  assert.deepEqual(acceptance.steps.map(step => step.name), requiredSteps, "候选验收步骤不完整");
  assert.ok(acceptance.steps.every(step => step.status === "passed" && step.exitCode === 0));
  assert.equal(installation.status, "passed");
  assert.equal(installation.nsisNamespace, "isolated acceptance; production GUID upgrade remains unverified");
  assert.equal(installation.candidateDefaultEngine, "node");
  assert.equal(installation.physicalPhone, "unverified");
  assert.equal(installation.checks.length, 8);
  assert.ok(installation.cleanup.startsWith("owned app uninstalled"));
  assert.equal(installation.externalModelRequests, 0);
  assert.equal(startup.status, "passed-in-measured-scope");
  assert.equal(startup.defaultEngineTested, true);
  assert.equal(startup.summary["process-restart"].count, 10);
  assert.equal(startup.summary["post-system-reboot"].count, 0);
  assert.equal(startup.physicalPhone, "unverified");
  assert.equal(startup.externalModelRequests, 0);
  assert.equal(startup.modelRequests, 11);
  assert.equal(packageSize.status, "measured");
  assert.ok(["complete-node-candidate", "complete-node-package"].includes(packageSize.kind));
  assert.equal(packageSize.application.pythonBytes, 0);
  assert.equal(packageSize.audit.runtime.engine, "node");
  const archive = digest(path.join(options.unpacked, "resources/app.asar")),
    installer = digest(options.installer);
  for (const [label, value] of [
    ["候选原生验收", acceptance.audit.archiveSha256],
    ["隔离安装验收", installation.applicationArchiveSha256],
    ["默认 Node 启动测量", startup.archiveSha256],
    ["包体测量", packageSize.application.archiveSha256],
    ["包体审计", packageSize.audit.archiveSha256],
  ]) assert.equal(value, archive, label + " 与当前 ASAR 不一致");
  assert.equal(packageSize.installer.sha256, installer, "安装器与包体报告不一致");
  assert.equal(packageSize.installer.bytes, fs.statSync(options.installer).size);
  assert.equal(installation.installerHashes.candidate, digest(options.installer), "安装验收必须使用当前候选安装器");
  const audit = require("./audit-package.cjs").run([
    options.unpacked, "--platform", "win32", "--arch", "x64", "--runtime", "node",
  ]);
  assert.equal(audit.archiveSha256, archive);
  const evidence = {
    acceptance: publicCopy(options.acceptance, "node-service-m5-acceptance.json"),
    installation: publicCopy(options.installation, "node-service-m5-installation.json"),
    startup: publicCopy(options.startup, "node-service-m5-startup.json"),
    package: publicCopy(options.package, "node-service-m5-package.json"),
  };
  const gate = (status, files, scope) => ({ status, scope, evidence: files });
  const release = {
    schemaVersion: 1,
    productVersion: require("../package.json").version,
    candidateSha256: installer,
    gates: {
      featureParity: gate("unverified", [evidence.acceptance, "docs/node-service-m5.md"], "Windows measured scope only; all Mac entries remain unverified"),
      migrationAndRollback: gate("passed", [evidence.installation], "Windows isolated migration, new data and actual pinned legacy readback"),
      windowsProductionUpgrade: gate("unverified", ["docs/node-service-m4.md"], "Requires a separate Windows environment; current installation is protected"),
      windowsNativeAndInstaller: gate("passed", [evidence.acceptance, evidence.installation], "Same archive; isolated NSIS namespace, not production GUID"),
      macArm64PackageAndInstall: gate("unverified", ["docs/node-service-m5.md"], "No Apple Silicon artifacts or installation evidence"),
      macX64PackageAndInstall: gate("unverified", ["docs/node-service-m5.md"], "No Intel Mac artifacts or installation evidence"),
      physicalPhoneAndSpeech: gate("unverified", [evidence.startup], "No Android/iPhone physical device or loudspeaker acceptance"),
      startupAndSize: gate("unverified", [evidence.startup, evidence.package], "Windows unpacked ten-restart measurement passed; five real system boots and complete final-install performance remain unverified"),
    },
  };
  validateRelease(release);
  const releaseFile = path.join(root, "artifacts/node-service-m5-release.json");
  fs.writeFileSync(releaseFile, JSON.stringify(release, null, 2));
  const result = require("./release-gates.cjs").evaluate(releaseFile, options.installer);
  assert.equal(result.status, "blocked");
  const report = {
    schemaVersion: 1,
    status: "partial-release-blocked",
    platform: "win32",
    arch: "x64",
    candidate: {
      installer: path.relative(root, options.installer),
      installerSha256: installer,
      archiveSha256: archive,
      defaultEngine: "node",
      productionDefault: "node",
    },
    evidence,
    verification: {
      acceptanceSteps: acceptance.steps,
      installationChecks: installation.checks,
      installationTimings: installation.installationTimings || [],
      startup: startup.summary,
      package: packageSize,
    },
    release,
    limits: [
      "Production GUID and real-user activation unverified",
      "Mac arm64/x64 packages and installation unverified",
      "Physical Android/iPhone and loudspeaker unverified",
      "Five real system reboot starts unverified",
      "Multi-monitor negative origins, mixed DPI and actual lock screen unverified",
    ],
    externalModelRequests: 0,
  };
  const summary = path.join(root, "artifacts/node-service-m5-check.json");
  fs.writeFileSync(summary, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, missing: result.missing, archiveSha256: archive, installerSha256: installer }));
  return report;
}
if (require.main === module) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main, parse };
