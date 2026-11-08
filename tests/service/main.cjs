const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { NodeRuntime } = require("../../desktop/node-runtime.cjs");
const { createSecrets } = require("../../desktop/secrets.cjs");
const directory = process.env.SNAP_SERVICE_TEST_DIR;
if (!directory || !path.isAbsolute(directory)) process.exit(2);
fs.mkdirSync(directory, { recursive: true }); app.setPath("userData", directory);
let runtime;
const report = { platform: process.platform, arch: process.arch, electron: process.versions.electron,
  entryInAsar: __filename.includes(".asar" + path.sep), appPathInAsar: app.getAppPath().endsWith(".asar"), checks: [] };
const output = value => fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(value, null, 2));
app.whenReady().then(async () => {
  runtime = new NodeRuntime(path.join(directory, "data"));
  await runtime.start();
  if (process.env.SNAP_SERVICE_TEST_HOLD === "1") {
    fs.writeFileSync(path.join(directory, "held.json"), JSON.stringify({ parentPid: process.pid, childPid: runtime.child.pid })); return;
  }
  assert.equal(runtime.ready, true);
  assert.deepEqual(await runtime.request("/snap/api/health"), { apiVersion: 1, ready: true });
  const unauthorized = await fetch(runtime.url + "/snap/api/health"); assert.equal(unauthorized.status, 401);
  const secrets = createSecrets(path.join(directory, "os-secret-probe"), safeStorage);
  await secrets({ operation: "set", providerId: "openai", value: "synthetic-only-never-account" });
  const reopened = createSecrets(path.join(directory, "os-secret-probe"), safeStorage);
  assert.equal(await reopened({ operation: "get", providerId: "openai" }), "synthetic-only-never-account");
  assert.ok(!fs.readFileSync(path.join(directory, "os-secret-probe/chat-node/v1/secrets.json"), "utf8").includes("synthetic-only-never-account"));
  await reopened({ operation: "delete", providerId: "openai" }); assert.equal(await reopened({ operation: "get", providerId: "openai" }), null);
  report.checks.push(...await require("./storage.cjs")(path.join(directory, "storage-tests")));
  report.checks.push(...await require("./phone-boundaries.cjs")(path.join(directory, "phone-boundaries")));
  report.checks.push(...await require("./bootstrap.cjs")(path.join(directory, "bootstrap")));
  const providerDirectory = path.join(directory, "provider-tests");
  report.checks.push(...await require("./providers.cjs")(providerDirectory, createSecrets(providerDirectory, safeStorage)));
  const generationDirectory = path.join(directory, "generation-tests");
  report.checks.push(...await require("./generations.cjs")(generationDirectory, createSecrets(generationDirectory, safeStorage)));
  report.checks.push(...await require("./utility.cjs")(path.join(directory, "utility-tests")));
  report.checks.push(...await require("./gateway.cjs")(path.join(directory, "gateway-tests")));
  const rpcCatalog = await runtime.providers();
  await runtime.saveProvider("alibaba", { apiVersion: 1, providerId: "alibaba", revision: rpcCatalog.providers.find(p => p.id === "alibaba").revision,
    baseUrl: "http://127.0.0.1:49999/custom/v1", apiType: "chat", keyAction: "set", apiKey: "synthetic-rpc-never-account", modelIds: ["fixture-model"] });
  assert.equal(await runtime.availableModels(), true);
  const rpcProvider = (await runtime.providers()).providers.find(p => p.id === "alibaba");
  await runtime.saveProvider("alibaba", { apiVersion: 1, providerId: "alibaba", revision: rpcProvider.revision,
    baseUrl: rpcProvider.baseUrl, apiType: "chat", keyAction: "delete", modelIds: ["fixture-model"] });
  assert.equal(await runtime.availableModels(), false);
  report.checks.push("utility-secret-rpc-provider-save-delete");
  const port = runtime.url, exited = once(runtime, "exit"); await runtime.stop(); await exited;
  assert.equal(runtime.stoppedAcknowledged, true); assert.equal(runtime.child, null);
  await assert.rejects(fetch(port + "/snap/api/health"));
  report.checks.push("lifecycle-ready-auth-shutdown", "os-backed-secret-roundtrip-delete");
  output({ status: "passed", ...report }); app.exit(0);
}).catch(async error => { output({ status: "failed", code: error.code || "SERVICE_TEST_FAILED", check: report.checks.length,
  assertion: error.code === "ERR_ASSERTION" ? { actualCode: error.actual?.code, expectedCode: error.expected?.code, operator: error.operator } : undefined,
  location: String(error.stack || "").split("\n").filter(line => line.trim().startsWith("at ")).slice(0, 4) }); await runtime?.stop(); app.exit(1); });
app.on("before-quit", () => runtime?.child?.kill());
setTimeout(() => { output({ status: "failed", code: "SERVICE_TEST_TIMEOUT" }); runtime?.child?.kill(); app.exit(2); }, 120000).unref();
