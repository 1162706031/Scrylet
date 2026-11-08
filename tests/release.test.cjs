const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
test("first-use prompt seed process payload is bounded and never accepts provider credentials", () => {
  const { validate } = require("../contracts/validate.cjs");
  const value = { protocolVersion: 1, type: "initialize", dataDirectory: path.resolve(".test-data/prompt-contract"), legacySource: null, productVersion: "test", catalogVersion: "test", credential: "x".repeat(32), parentPid: 1, testCapabilities: [], promptSeeds: { custom: { name: "名称", content: "原提示词" } } };
  assert.equal(validate("processMessage", value).promptSeeds.custom.content, "原提示词");
  for (const seeds of [{ custom: { name: "x", content: "x", apiKey: "synthetic-only" } }, { ["x".repeat(155)]: { name: "x", content: "x" } }, { custom: { name: "", content: "x" } }]) assert.throws(() => validate("processMessage", { ...value, promptSeeds: seeds }));
});
test("Node candidate defaults locally without a legacy loader or a fake release switch", () => {
  const { packageConfig } = require("../scripts/package-config.cjs"),
    { runtimeDefault } = require("../desktop/runtime.cjs");
  const config = packageConfig({
    platform: "win32",
    arch: "x64",
    profile: "node-candidate",
  });
  assert.equal(runtimeDefault(config.extraMetadata), "node");
  assert.equal(runtimeDefault(), "node");
  assert.throws(() => packageConfig({ platform: "win32", arch: "x64", profile: "legacy" }));
  assert.throws(() => runtimeDefault({ scryletRuntimeDefault: "legacy" }));
  const production = packageConfig({ platform: "win32", arch: "x64" });
  assert.equal(runtimeDefault(production.extraMetadata), "node");
  assert.equal(production.nsis.guid, undefined);
  assert.equal(production.nsis.include, undefined);
  assert.ok(config.files.includes("!desktop/legacy-*.cjs"));
  assert.ok(!config.extraResources.some((f) => /python|runtime\//.test(f.to)));
  assert.equal(require("../package.json").dependencies["http-proxy"], undefined);
  assert.equal(config.nsis.guid, require("../scripts/migration-install-profile.cjs").LAB_GUID);
  assert.equal(config.nsis.runAfterFinish, false);
  assert.equal(config.nsis.include, "packaging/node-candidate.nsh");
  const paths = require("../desktop/runtime-paths.cjs").runtimePaths();
  for (const name of ["python", "launcher", "mouse"])
    assert.equal(Object.hasOwn(paths, name), false);
});
test("release contract rejects omissions, unknown gates and inferred passes", (t) => {
  const { gates, validateRelease } = require("../contracts/release.cjs");
  const report = {
    schemaVersion: 1,
    productVersion: "synthetic",
    candidateSha256: "a".repeat(64),
    gates: Object.fromEntries(
      gates.map((key) => [
        key,
        { status: "unverified", evidence: ["docs/node-service-m4.md"] },
      ]),
    ),
  };
  assert.equal(
    validateRelease(report).gates.macArm64PackageAndInstall.status,
    "unverified",
  );
  for (const bad of [
    { ...report, schemaVersion: 2 },
    { ...report, gates: {} },
    { ...report, apiKey: "synthetic-only" },
    {
      ...report,
      gates: {
        ...report.gates,
        featureParity: { status: "estimated", evidence: [] },
      },
    },
  ])
    assert.throws(() => validateRelease(bad), /RELEASE_EVIDENCE_INVALID/);
  assert.equal(
    require("../scripts/release-gates.cjs").evaluate().status,
    "blocked",
  );
  const base = path.resolve(__dirname, "../.test-data/node-service-m5"); fs.mkdirSync(base, { recursive: true });
  const directory = fs.mkdtempSync(path.join(base, "gate-")); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const candidate = path.join(directory, "synthetic.bin"), file = path.join(directory, "report.json"); fs.writeFileSync(candidate, "synthetic candidate");
  report.productVersion = require("../package.json").version;
  report.candidateSha256 = require("node:crypto").createHash("sha256").update(fs.readFileSync(candidate)).digest("hex");
  fs.writeFileSync(file, JSON.stringify(report));
  assert.equal(require("../scripts/release-gates.cjs").evaluate(file, candidate).missing.length, gates.length);
  fs.appendFileSync(candidate, "changed");
  assert.throws(() => require("../scripts/release-gates.cjs").evaluate(file, candidate), /RELEASE_CANDIDATE_MISMATCH/);
});
test("M5 evidence collector requires the full suite and one immutable candidate", () => {
  const { parse } = require("../scripts/collect-node-evidence.cjs");
  assert.throws(() => parse([]), /M5_EVIDENCE_ARGUMENTS/);
  const values = [
    "--acceptance", ".test-data/acceptance.json",
    "--installation", ".test-data/installation.json",
    "--startup", ".test-data/startup.json",
    "--package", ".test-data/package.json",
    "--unpacked", "build/candidate/win-unpacked",
    "--installer", "build/candidate/Setup.exe",
  ];
  const options = parse(values);
  assert.equal(options.startup, path.resolve(".test-data/startup.json"));
  assert.equal(options.installer, path.resolve("build/candidate/Setup.exe"));
});
test("first-use seeds preserve local custom URLs, delete tombstones and all explicit saves", async (t) => {
  const { importConnectionSeeds } = require("../desktop/connection-seeds.cjs");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-seeds-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const legacy = path.join(directory, "legacy");
  fs.mkdirSync(legacy);
  const catalog = require("../config/providers.json").providers,
    selected = catalog.find((p) => p.id === "alibaba");
  const keyFile = path.join(legacy, "api_keys.json");
  fs.writeFileSync(
    keyFile,
    JSON.stringify({ [selected.legacyKey]: "synthetic-seed-key" }),
  );
  fs.writeFileSync(
    path.join(legacy, "proxy_api.json"),
    JSON.stringify({
      enabled: true,
      apis: { alibaba: "http://127.0.0.1:49999/v1" },
    }),
  );
  const before = fs.readFileSync(keyFile),
    changes = [],
    rows = catalog.map((p) => ({
      id: p.id,
      revision: 0,
      baseUrl: p.baseUrl,
      apiType: p.apiType,
      models: p.models,
    }));
  const runtime = {
    providers: async () => ({ providers: rows }),
    saveProvider: async (id, value) => {
      changes.push(value);
      rows.find((p) => p.id === id).revision++;
    },
  };
  await importConnectionSeeds(runtime, {
    directory,
    legacyDirectory: legacy,
    env: {},
  });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].apiKey, "synthetic-seed-key");
  assert.equal(changes[0].baseUrl, "http://127.0.0.1:49999/v1");
  fs.unlinkSync(path.join(directory, "connection-bootstrap.json"));
  await importConnectionSeeds(runtime, {
    directory,
    legacyDirectory: legacy,
    env: {},
  });
  assert.equal(changes.length, 1);
  assert.ok(fs.readFileSync(keyFile).equals(before));
});
test("bad seed input blocks completion and retries only untouched connections", async (t) => {
  const { importConnectionSeeds } = require("../desktop/connection-seeds.cjs"),
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-seed-fail-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.writeFileSync(path.join(directory, "api_keys.json"), "broken-json");
  const runtime = {
    providers: async () => ({ providers: [{ id: "alibaba", revision: 0 }] }),
    saveProvider: async () => {
      throw Error("must not write");
    },
  };
  await assert.rejects(
    importConnectionSeeds(runtime, {
      directory,
      legacyDirectory: directory,
      env: {},
    }),
    { code: "MIGRATION_FAILED" },
  );
  assert.equal(
    fs.existsSync(path.join(directory, "connection-bootstrap.json")),
    false,
  );
});
