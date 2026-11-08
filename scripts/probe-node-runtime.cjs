const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");
const { _electron: electron, chromium, webkit, expect } = require("@playwright/test");
const asar = require("@electron/asar");
const root = path.resolve(__dirname, "..");

function buildPhone() {
  for (const [entry, args] of [
    ["node_modules/typescript/bin/tsc", ["--noEmit", "-p", "phone/tsconfig.json"]],
    ["node_modules/vite/bin/vite.js", ["build", "--config", "phone/vite.config.mts"]],
  ]) {
    const result = spawnSync(process.execPath, [path.join(root, entry), ...args], { cwd: root, encoding: "utf8" });
    fs.appendFileSync(path.join(currentDirectory, "build.log"), result.stdout + result.stderr);
    if (result.status !== 0) throw new Error("COMPAT_FRONTEND_BUILD_FAILED");
  }
}

function resolvePackage(name, from) {
  let entry;
  try { entry = require.resolve(name + "/package.json", { paths: [from] }); }
  catch { entry = require.resolve(name, { paths: [from] }); }
  for (let directory = path.dirname(entry); directory !== path.dirname(directory); directory = path.dirname(directory)) {
    const file = path.join(directory, "package.json");
    if (fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8")).name === name) return directory;
  }
  throw new Error("COMPAT_PACKAGE_UNRESOLVED");
}

async function makeArchive(directory) {
  const staging = path.join(directory, "staging"), target = path.join(directory, "实验 有空格.目录", "app.asar");
  fs.mkdirSync(staging, { recursive: true }); fs.mkdirSync(path.dirname(target), { recursive: true });
  for (const file of ["tests/compat/main.cjs", "tests/compat/worker.cjs", "tests/compat/protocol.cjs", "tests/mock-provider.cjs", "LICENSE", "THIRD_PARTY_NOTICES.md"]) {
    fs.mkdirSync(path.dirname(path.join(staging, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(staging, file));
  }
  fs.cpSync(path.join(root, "build/phone"), path.join(staging, "phone-dist"), { recursive: true });
  const packages = new Map();
  function collect(name, from) {
    const directory = resolvePackage(name, from); if (packages.has(directory)) return;
    const relative = path.relative(root, directory);
    if (!relative.startsWith("node_modules" + path.sep)) throw new Error("COMPAT_PACKAGE_OUTSIDE_ROOT");
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
    packages.set(directory, { name, version: manifest.version, license: manifest.license });
    fs.cpSync(directory, path.join(staging, relative), { recursive: true,
      filter: file => !path.relative(directory, file).split(path.sep).includes("node_modules") });
    for (const dependency of Object.keys(manifest.dependencies || {})) collect(dependency, directory);
  }
  const roots = ["ai", "@ai-sdk/openai", "@ai-sdk/openai-compatible", "zod"];
  for (const name of roots) collect(name, root);
  fs.writeFileSync(path.join(staging, "package.json"), JSON.stringify({ name: "scrylet-compatibility-probe", version: require("../package.json").version,
    main: "tests/compat/main.cjs", dependencies: Object.fromEntries(roots.map(name => [name, require(path.join(resolvePackage(name, root), "package.json")).version])) }));
  await asar.createPackage(staging, target);
  const files = asar.listPackage(target).map(file => file.replace(/\\/g, "/"));
  for (const required of ["/tests/compat/worker.cjs", "/node_modules/ai/dist/index.js", "/phone-dist/index.html", "/phone-dist/licenses.md", "/LICENSE", "/THIRD_PARTY_NOTICES.md"])
    expect(files).toContain(required);
  const browserLicenses = asar.extractFile(target, "phone-dist/licenses.md").toString();
  expect(browserLicenses).toContain("react"); expect(browserLicenses).toContain("MIT License");
  expect(files.filter(file => /\/(?:\.runtime|\.snapsolver|\.test-data|python|runtime)\//.test(file))).toHaveLength(0);
  return { file: target, report: { bytes: fs.statSync(target).size, sha256: crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    entries: files.length, productionPackages: [...packages.values()], noLegacyRuntime: true, browserLicensesIncluded: true } };
}

function environment(directory, insideAsar, hold = false) {
  const env = { ...process.env, SNAP_COMPAT_DATA_DIR: directory, SNAP_COMPAT_ASAR: insideAsar ? "1" : "0", SNAP_COMPAT_HOLD: hold ? "1" : "0" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_PATH; delete env.NODE_OPTIONS;
  for (const provider of require("../config/providers.json").providers) delete env[provider.envKey];
  return env;
}

async function probe(entry, directory, insideAsar) {
  fs.mkdirSync(directory, { recursive: true });
  let app;
  try {
    app = await electron.launch({ args: [entry], cwd: directory, env: environment(directory, insideAsar), timeout: 45000 });
    const file = path.join(directory, "result.json");
    await expect.poll(() => fs.existsSync(file), { timeout: 45000, intervals: [50] }).toBe(true);
    const result = JSON.parse(fs.readFileSync(file, "utf8"));
    if (result.status !== "passed") throw new Error(result.code);
    expect(result.entryInAsar).toBe(insideAsar); expect(result.mainAppPathInAsar).toBe(insideAsar);
    expect(result.sdk.resolvedFromAsar).toBe(insideAsar);
    expect(result.phoneAssetsReadable).toBe(true); expect(result.storage.dataOutsideAsar).toBe(true);
    const browserChecks = [];
    for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
      const browser = await engine.launch();
      let page;
      try {
        page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
        const errors = [], external = [];
        page.on("pageerror", () => errors.push(true));
        await page.route("**/*", route => {
          const url = new URL(route.request().url());
          if (url.hostname !== "127.0.0.1") { external.push(true); return route.abort(); }
          return route.continue();
        });
        await page.goto("http://127.0.0.1:" + result.port + "/compatibility.html");
        await expect(page.getByRole("heading", { name: "运行层兼容实验" })).toBeVisible();
        await page.getByRole("button", { name: "验证 SDK 聊天状态" }).click();
        await expect(page.getByRole("log")).toHaveText("兼容实验通过");
        await expect(page.getByRole("status", { name: "SDK 状态" })).toHaveText("ready");
        await expect(page.getByLabel("消息数")).toHaveText("2");
        expect(errors).toHaveLength(0); expect(external).toHaveLength(0);
        await page.screenshot({ path: path.join(directory, name + ".png") });
        browserChecks.push({ engine: name, strictBuildServed: true, sdkTransport: true, sdkOwnsMessages: true, pageErrors: 0, externalRequests: 0 });
      } catch (error) {
        await page?.screenshot({ path: path.join(directory, name + "-failure.png") }).catch(() => {});
        // This page is synthetic and receives no keys or authentication data.
        // Keep full browser assertion diagnostics locally, never in artifacts.
        fs.writeFileSync(path.join(directory, name + "-failure.txt"), String(error.message));
        throw new Error("COMPAT_BROWSER_" + name.toUpperCase() + "_FAILED");
      } finally { await browser.close(); }
    }
    delete result.port;
    await app.close(); app = null;
    return { ...result, browserChecks, differentCwd: true };
  } finally { await app?.close().catch(() => {}); }
}

function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === "ESRCH") return false; throw error; } }
async function parentDeath(entry, directory, insideAsar) {
  fs.mkdirSync(directory, { recursive: true });
  const parent = spawn(require("electron"), [entry], { cwd: directory, env: environment(directory, insideAsar, true), stdio: "ignore", windowsHide: true });
  let childPid;
  try {
    const file = path.join(directory, "held.json");
    await expect.poll(() => fs.existsSync(file), { timeout: 15000, intervals: [50] }).toBe(true);
    const info = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(info.mainPid).toBe(parent.pid); expect(info.childPid).toBeGreaterThan(0); childPid = info.childPid;
    // Kill this isolated parent only. /T would invalidate the orphan check.
    parent.kill("SIGKILL");
    await expect.poll(() => alive(childPid), { timeout: 5000, intervals: [50] }).toBe(false);
    return { parentOnlyKilled: true, childExited: true, parentExistencePollMs: 250, insideAsar };
  } finally { if (parent.pid && alive(parent.pid)) parent.kill(); if (childPid && alive(childPid)) process.kill(childPid); }
}

let currentDirectory;
async function main() {
  const parent = path.join(root, ".test-data/node-service-m03"); fs.mkdirSync(parent, { recursive: true });
  currentDirectory = fs.mkdtempSync(path.join(parent, "run-"));
  const result = { schemaVersion: 1, status: "running", platform: process.platform, arch: process.arch,
    defaultEngine: "legacy", source: null, asar: null, parentDeath: [] };
  let external;
  try {
    buildPhone();
    const archive = await makeArchive(currentDirectory); result.archive = archive.report;
    const sourceEntry = path.join(root, "tests/compat/main.cjs");
    result.source = await probe(sourceEntry, path.join(currentDirectory, "source"), false);
    external = fs.mkdtempSync(path.join(os.tmpdir(), "scrylet-asar-compat-"));
    const independentArchive = path.join(external, "实验 有空格.目录", "app.asar");
    fs.mkdirSync(path.dirname(independentArchive), { recursive: true }); fs.copyFileSync(archive.file, independentArchive);
    result.asar = await probe(independentArchive, path.join(external, "data"), true);
    result.asar.outsideProject = true; result.asar.nodePathCleared = true;
    result.parentDeath.push(await parentDeath(sourceEntry, path.join(currentDirectory, "source-parent-death"), false));
    result.parentDeath.push(await parentDeath(independentArchive, path.join(external, "parent-death"), true));
    result.status = "passed";
    result.unverified = ["macOS arm64", "macOS x64", "installed packages", "full migration", "product HTTP/SSE transport"];
  } catch (error) {
    result.status = "failed";
    result.code = typeof error.message === "string" && /^COMPAT_[A-Z_]+$/.test(error.message) ? error.message : "COMPAT_ACCEPTANCE_FAILED";
    process.exitCode = 1;
  } finally {
    if (external) {
      for (const [from, to] of [["data", "asar"], ["parent-death", "asar-parent-death"]])
        if (fs.existsSync(path.join(external, from))) fs.cpSync(path.join(external, from), path.join(currentDirectory, to), { recursive: true });
      fs.rmSync(external, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
    fs.writeFileSync(path.join(currentDirectory, "report.json"), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ status: result.status, code: result.code, evidence: path.relative(root, currentDirectory) }));
  }
}

if (require.main === module) main();
module.exports = { resolvePackage };
