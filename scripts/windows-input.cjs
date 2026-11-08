// Test-only wrapper. No production module imports this file.
const path = require("node:path"),
  fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const { inspectPe } = require("../desktop/native-program.cjs");
const root = path.resolve(__dirname, "..");
function assertInputDesktopUnused() {
  if (process.platform !== "win32")
    throw Error("需要 Windows 本机，未注入输入");
  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "@(Get-Process -Name Scrylet,Snap-Solver,electron -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id) -join ','",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0 || result.error)
    throw Error("无法核对现有桌面程序，未注入输入");
  if (result.stdout.trim())
    throw Error(
      "检测到已运行的 Scrylet / Electron；为保护现有会话，未注入系统输入",
    );
}
function input(args, { timeout = 20000, parentPid = process.pid } = {}) {
  const program = path.join(
      root,
      "build/native/win32-x64/test-input-driver.exe",
    ),
    manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, "build/native/win32-x64/test-manifest.json"),
      ),
    );
  const actual = inspectPe(program),
    expected = manifest.files["test-input-driver.exe"];
  if (
    !manifest.testOnly ||
    actual.arch !== "x64" ||
    actual.sha256 !== expected.sha256 ||
    actual.bytes !== expected.bytes
  )
    return Promise.reject(Error("测试输入程序损坏或架构不匹配"));
  return new Promise((resolve, reject) => {
    const child = spawn(program, [...args, "--parent", String(parentPid)], {
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
    });
    child.stdin.on("error", () => {});
    child.stderr.resume();
    let force;
    const timer = setTimeout(() => {
      child.stdin.end();
      force = setTimeout(() => child.kill(), 2500);
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      clearTimeout(force);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      clearTimeout(force);
      code === 0
        ? resolve()
        : reject(Error("Windows 原生测试输入失败 / 被取消，未假定权限通过"));
    });
  });
}
module.exports = { input, assertInputDesktopUnused };
