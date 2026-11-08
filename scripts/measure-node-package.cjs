const fs = require("node:fs"),
  path = require("node:path");
const { digest, walk } = require("./package-audit.cjs");
function main(argv = process.argv.slice(2)) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("当前测量入口只记录真实 Windows x64，不代替 Mac 包体");
  const root = path.resolve(__dirname, ".."),
    output = path.join(root, "build/node-win-x64-release/output");
  const options = {
    directory: path.join(output, "win-unpacked"),
    installer: path.join(
      output,
      "Scrylet-" + require("../package.json").version + "-win-x64-Setup.exe",
    ),
  };
  for (let i = 0; i < argv.length; i++) {
    const key = {
      "--directory": "directory",
      "--installer": "installer",
      "--output": "output",
    }[argv[i]];
    if (!key || !argv[i + 1]) throw Error("PACKAGE_MEASURE_ARGUMENTS");
    options[key] = path.resolve(argv[++i]);
  }
  const audit = require("./audit-package.cjs").run([
    options.directory,
    "--platform",
    "win32",
    "--arch",
    "x64",
    "--runtime",
    "node",
  ]);
  const links = [],
    files = walk(options.directory, { links });
  if (links.length) throw Error("PACKAGE_SIZE_SYMLINK_UNVERIFIED");
  const archive = path.join(options.directory, "resources/app.asar"),
    installerBytes = fs.statSync(options.installer).size,
    applicationBytes = files.reduce(
      (sum, file) => sum + fs.statSync(file).size,
      0,
    );
  const report = {
    schemaVersion: 1,
    status: "measured",
    platform: "win32",
    arch: "x64",
    kind: "complete-node-package",
    installer: {
      file: path.relative(root, options.installer),
      bytes: installerBytes,
      sha256: digest(options.installer),
      MiB: Number((installerBytes / 1048576).toFixed(3)),
    },
    application: {
      bytes: applicationBytes,
      files: files.length,
      MiB: Number((applicationBytes / 1048576).toFixed(3)),
      archiveBytes: fs.statSync(archive).size,
      archiveSha256: digest(archive),
      pythonBytes: 0,
    },
    audit,
    finalInstallation: "separate acceptance evidence required",
    mac: "unverified; no Mac sizes substituted",
  };
  if (options.output)
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
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
