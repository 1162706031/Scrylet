const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const stage = path.join(root, "build/python");
const developmentPython = path.join(root, ".runtime/Scripts/python.exe");
function inspect(python) {
  const result = spawnSync(python, ["-I", "-B", "-c", [
    "import json, sys, platform, ssl, sqlite3",
    "from importlib.metadata import version",
    "import open_webui, psutil, numpy, pycrdt, re2, cryptography",
    "print(json.dumps(dict(base=sys.base_prefix, python=platform.python_version(), machine=platform.machine(), webui=version('open-webui'))))",
  ].join("; ")], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) throw new Error("Python 运行环境验证失败：" + (result.stderr || result.error?.message));
  return JSON.parse(result.stdout.trim());
}

function prepare() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("请在 Windows x64 本机生成安装包。");
  const source = inspect(developmentPython);
  if (!source.python.startsWith("3.12.") || source.webui !== "0.12.2" || source.machine !== "AMD64")
    throw new Error("需要已验证的 Python 3.12 x64 与 Open WebUI 0.12.2 环境。");
  fs.rmSync(stage, { recursive: true, force: true });
  const keep = (base, file, skipSite = false) => {
    const relative = path.relative(base, file);
    if (!relative) return true;
    const parts = relative.split(path.sep);
    if (parts.includes("__pycache__") || /\.py[co]$/.test(file)) return false;
    if (skipSite && relative.toLowerCase().startsWith("lib" + path.sep + "site-packages")) return false;
    return !["_virtualenv.pth", "_virtualenv.py"].includes(path.basename(file));
  };
  console.log("准备可独立运行的 Windows Python…");
  fs.cpSync(source.base, stage, { recursive: true, filter: (file) => keep(source.base, file, true) });
  const packages = path.join(root, ".runtime/Lib/site-packages");
  fs.cpSync(packages, path.join(stage, "Lib/site-packages"), { recursive: true, filter: (file) => keep(packages, file) });
  const relocated = inspect(path.join(stage, "python.exe"));
  if (path.resolve(relocated.base).toLowerCase() !== stage.toLowerCase()) throw new Error("Python 仍依赖开发机安装位置，拒绝打包。");
  const manifest = {
    python: relocated.python, openWebUI: relocated.webui, architecture: "x64",
    requirementsSha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "runtime/requirements.lock"))).digest("hex"),
  };
  fs.writeFileSync(path.join(stage, "runtime-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log("独立 Python 与固定版本依赖验证通过。");
}

if (require.main === module) {
  try { prepare(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { prepare };
