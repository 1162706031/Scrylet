const fs = require("node:fs"), path = require("node:path");
const { spawnSync } = require("node:child_process");
const { packageConfig } = require("./package-config.cjs");
const { digest } = require("./package-audit.cjs");
function main(argv = process.argv.slice(2)) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("Windows 包需要本机 Windows x64");
  let profile = "development", directoryOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dir") directoryOnly = true;
    else if (argv[i] === "--profile" && argv[i + 1] === "node-candidate") { profile = argv[++i]; }
    else throw Error("仅支持 --dir 或 --profile node-candidate");
  }
  const root = path.resolve(__dirname, ".."), version = require("../package.json").version;
  const stage = path.join(root, "build", profile === "node-candidate" ? "node-win-x64-candidate" : "node-win-x64-release");
  fs.mkdirSync(stage, { recursive: true });
  const report = { status: "running", platform: "win32", arch: "x64", version,
    profile, defaultEngine: "node", installation: "unverified", artifacts: [] };
  const run = (args) => {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
    if (result.error || result.status !== 0) throw Error("NODE_PACKAGE_BUILD_FAILED");
  };
  try {
    run(["scripts/setup.cjs"]);
    const config = packageConfig({ platform: "win32", arch: "x64", profile });
    config.directories.app = require("./node-package-stage.cjs").stageNodePackage(root, stage);
    config.files = config.files.map(file => typeof file === "object" && file.to === "phone-dist"
      ? { from: "phone-dist", to: "phone-dist", filter: ["**/*"] } : file);
    config.directories.output = path.join(stage, "output");
    config.electronDist = path.join(root, "node_modules/electron/dist");
    const file = path.join(stage, "builder.json");
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    run(["node_modules/electron-builder/cli.js", "--config", file, "--win",
      ...(directoryOnly ? ["--dir"] : ["nsis"]), "--x64", "--publish", "never"]);
    report.audit = require("./audit-package.cjs").run([
      path.join(config.directories.output, "win-unpacked"), "--platform", "win32", "--arch", "x64", "--runtime", "node",
    ]);
    if (!directoryOnly && profile !== "node-candidate") {
      const deliver = path.join(root, "dist/releases", version);
      fs.mkdirSync(deliver, { recursive: true });
      const name = `Scrylet-${version}-win-x64-Setup.exe`;
      const from = path.join(config.directories.output, name), target = path.join(deliver, name);
      fs.copyFileSync(from, target);
      const sha256 = digest(target);
      fs.writeFileSync(target + ".sha256", sha256 + "  " + name + "\n");
      report.artifacts.push({ file: path.relative(root, target), bytes: fs.statSync(target).size, sha256 });
    }
    report.status = "built-not-installed";
    report.unpacked = path.relative(root, path.join(config.directories.output, "win-unpacked"));
  } catch (error) {
    report.status = "failed"; report.code = error.message; throw error;
  } finally {
    fs.writeFileSync(path.join(stage, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  }
  return report;
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { main };
