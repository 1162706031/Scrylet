const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

function parseOptions(args) {
  const result = { runs: 10, directory: ".test-data/startup-legacy", postReboot: false, prepareOnly: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--post-reboot") result.postReboot = true;
    else if (args[i] === "--prepare") result.prepareOnly = true;
    else if (args[i] === "--runs" && /^\d+$/.test(args[i + 1] || "")) result.runs = Number(args[++i]);
    else if (args[i] === "--directory" && args[i + 1]) result.directory = args[++i];
    else throw new Error("启动测量参数无效");
  }
  if (!Number.isInteger(result.runs) || result.runs < 1 || result.runs > 100 ||
      (result.prepareOnly && result.postReboot)) throw new Error("启动测量参数无效");
  if (result.postReboot) result.runs = 1;
  // The harness can create and own data only inside the repository test root.
  const root = path.resolve(__dirname, "../.test-data");
  result.directory = path.resolve(result.directory);
  const relative = path.relative(root, result.directory);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative))
    throw new Error("启动测量必须使用 .test-data 内的专用子目录");
  return result;
}

function bootInfo() {
  if (process.platform !== "win32") throw new Error("当前启动基线脚本仅在 Windows 完成验收");
  const executable = path.join(process.env.SystemRoot || "C:\\Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  const value = execFileSync(executable, ["-NoProfile", "-NonInteractive", "-Command",
    "([DateTimeOffset](Get-CimInstance Win32_OperatingSystem).LastBootUpTime).ToUnixTimeMilliseconds()"],
  { encoding: "utf8", windowsHide: true, timeout: 15000 }).trim();
  const bootedAt = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(bootedAt) || bootedAt <= 0 || bootedAt > Date.now())
    throw new Error("无法确认系统启动标识");
  return { id: crypto.createHash("sha256").update(String(bootedAt)).digest("hex").slice(0, 24),
    bootedAt: new Date(bootedAt).toISOString(), uptimeSeconds: Math.floor((Date.now() - bootedAt) / 1000) };
}

function assertNewBoot(samples, boot) {
  if (samples.some(sample => sample.bootId === boot.id))
    throw Object.assign(new Error("此系统启动周期已采样；不能将进程重启记作系统重启后首次启动"), { code: "BOOT_ALREADY_SAMPLED" });
}

function distribution(values) {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (!sorted.length) return { count: 0, medianMs: null, maxMs: null };
  const middle = Math.floor(sorted.length / 2);
  return { count: sorted.length,
    medianMs: Math.round((sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2) * 1000) / 1000,
    maxMs: sorted.at(-1) };
}

function summarize(samples) {
  const successful = samples.filter(sample => sample.status === "passed");
  function group(kind) {
    const selected = successful.filter(sample => sample.kind === kind);
    const phases = {};
    for (const sample of selected) for (const point of sample.metrics.phases)
      (phases[point.phase] ||= []).push(point.elapsedMs);
    const intervals = {};
    for (const [label, from, to] of [
      ["spawnToHealthy", "service-spawned", "legacy-http-healthy"],
      ["healthyToServiceReady", "legacy-http-healthy", "service-ready"],
      ["serviceReadyToPhoneInteractive", "service-ready", "phone-interactive"],
      ["mockRequestToAnswerVisible", "usable", "answer-visible"],
      ["mockRequestToAnswerCompleted", "usable", "answer-completed"],
    ]) {
      intervals[label] = distribution(selected.map(sample => {
        const points = Object.fromEntries(sample.metrics.phases.map(point => [point.phase, point.elapsedMs]));
        return points[to] - points[from];
      }));
    }
    return { count: selected.length, phases: Object.fromEntries(Object.entries(phases).map(([k, v]) => [k, distribution(v)])), intervals };
  }
  const postReboot = group("post-system-reboot");
  const processRestart = group("process-restart");
  return { initialization: group("initialization"), processRestart, postReboot,
    failed: samples.filter(sample => sample.status === "failed").length,
    acceptance: { processRestartTen: processRestart.count >= 10,
      distinctSystemBootsFive: new Set(successful.filter(s => s.kind === "post-system-reboot").map(s => s.bootId)).size >= 5 } };
}

function systemInfo() {
  return { platform: process.platform, arch: process.arch, system: os.version(), release: os.release(),
    cpu: os.cpus()[0]?.model.trim(), logicalProcessors: os.cpus().length, memoryBytes: os.totalmem(),
    controllerNode: process.version, electron: require("electron/package.json").version };
}

function packageSizes() {
  const root = path.resolve(__dirname, "../dist/win-unpacked");
  const installer = path.resolve(__dirname, "../dist/Scrylet-" + require("../package.json").version + "-win-x64-Setup.exe");
  if (!fs.existsSync(root) || !fs.existsSync(installer)) return { status: "not-measured", reason: "legacy artifacts absent" };
  const result = { status: "measured", artifact: path.basename(installer), installerBytes: fs.statSync(installer).size,
    installerSha256: crypto.createHash("sha256").update(fs.readFileSync(installer)).digest("hex"),
    application: { bytes: 0, files: 0 }, python: { bytes: 0, files: 0 }, other: { bytes: 0, files: 0 } };
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const size = fs.statSync(file).size;
        const group = file.startsWith(path.join(root, "resources/python") + path.sep) ? "python" : "other";
        for (const key of ["application", group]) { result[key].bytes += size; result[key].files++; }
      }
    }
  }
  walk(root);
  result.appAsarBytes = fs.statSync(path.join(root, "resources/app.asar")).size;
  return result;
}

module.exports = { parseOptions, bootInfo, assertNewBoot, distribution, summarize, systemInfo, packageSizes };

function claimDirectory(directory) {
  const testRoot = path.resolve(__dirname, "../.test-data");
  directory = parseOptions(["--directory", directory]).directory;
  for (let current = directory; current !== path.dirname(testRoot); current = path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("测量目录不能使用符号链接或 junction");
  }
  if (fs.existsSync(directory) && fs.readdirSync(directory).length && !fs.existsSync(path.join(directory, "manifest.json")))
    throw new Error("目录没有测量标记，不接管已有数据");
  fs.mkdirSync(directory, { recursive: true });
}

module.exports.claimDirectory = claimDirectory;
