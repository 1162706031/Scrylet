const path = require("node:path"),
  fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { auditPackage } = require("./package-audit.cjs");
function argumentsFor(argv) {
  const options = { directory: path.join(__dirname, "../build/node-win-x64-release/output/win-unpacked") };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i];
    if (value === "--structural-only") { options.structuralOnly = true; continue; }
    if (value.startsWith("--")) {
      const key = {
        "--platform": "platform",
        "--arch": "arch",
        "--runtime": "runtime",
        "--output": "output",
      }[value];
      if (!key || !argv[i + 1]) throw Error("PACKAGE_ARGUMENTS");
      options[key] = argv[++i];
    } else options.directory = value;
  }
  return options;
}
function run(argv = process.argv.slice(2)) {
  const options = argumentsFor(argv);
  if ((options.platform || process.platform) === "darwin") {
    if (process.platform !== "darwin" && !options.structuralOnly)
      throw Error("Mac app 原生审计需要真实 macOS；跨平台仅可显式 --structural-only");
    if (options.structuralOnly) {
      options.plist = require("plist").parse(fs.readFileSync(path.join(options.directory, "Contents/Info.plist"), "utf8"));
    } else {
      const result = spawnSync(
      "/usr/bin/plutil",
      [
        "-convert",
        "json",
        "-o",
        "-",
        path.join(options.directory, "Contents/Info.plist"),
      ],
      { encoding: "utf8" },
    );
      if (result.status !== 0) throw Error("MAC_PLIST_FAILED");
      options.plist = JSON.parse(result.stdout);
    }
  }
  const report = auditPackage(options);
  report.verification = options.structuralOnly ? "structure-only; target OS execution unverified" : "package-resources";
  if (options.output)
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
  return report;
}
if (require.main === module) {
  try {
    console.log(JSON.stringify(run()));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { run, argumentsFor };
