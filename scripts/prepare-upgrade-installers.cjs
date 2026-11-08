// Repackage unchanged old/new application payloads in an isolated NSIS namespace.
// This builds local acceptance installers; it never installs or publishes them.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
function parse(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const key = {
      "--old-installer": "old",
      "--new-unpacked": "next",
      "--output": "output",
    }[argv[i]];
    if (!key || !argv[i + 1] || options[key])
      throw Error("需要 --old-installer、--new-unpacked 和尚不存在的 --output");
    options[key] = path.resolve(argv[++i]);
  }
  if (!options.old || !options.next || !options.output)
    throw Error("缺少隔离安装器构建参数");
  return options;
}
async function main(argv = process.argv.slice(2)) {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw Error("隔离 NSIS 构建需要 Windows x64");
  const options = parse(argv),
    root = path.resolve(__dirname, ".."),
    base = fs.realpathSync(path.join(root, ".test-data"));
  if (fs.existsSync(options.output)) throw Error("输出目录已存在，未覆盖");
  const parent = fs.realpathSync(path.dirname(options.output)),
    relative = path.relative(base, parent);
  if (
    relative === ".." ||
    relative.startsWith(".." + path.sep) ||
    path.isAbsolute(relative)
  )
    throw Error("输出必须位于隔离 .test-data 中");
  if (
    !fs.statSync(options.old).isFile() ||
    !fs.existsSync(path.join(options.next, "resources/app.asar"))
  )
    throw Error("缺少原始旧安装器或新版解包资源");
  const hash = (file) =>
    crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const oldInstallerHash = hash(options.old),
    newArchiveHash = hash(path.join(options.next, "resources/app.asar"));
  fs.mkdirSync(options.output, { mode: 0o700 });
  const run = (file, args) => {
    const result = spawnSync(file, args, { cwd: root, stdio: "inherit" });
    if (result.error || result.status !== 0)
      throw Error("ISOLATED_INSTALLER_BUILD_FAILED");
  };
  const seven = await require("app-builder-lib/out/toolsets/7zip").getPath7za(),
    old = path.join(options.output, "old-extracted");
  run(seven, ["x", options.old, "-o" + old, "-y"]);
  if (
    !fs.existsSync(path.join(old, "Scrylet.exe")) ||
    !fs.existsSync(path.join(old, "resources/app.asar"))
  )
    throw Error("旧安装器不是预期的完整固定负载");
  const include = path.join(options.output, "acceptance.nsh");
  fs.writeFileSync(
    include,
    '!ifdef APP_INSTALLER_STORE_FILE\n!undef APP_INSTALLER_STORE_FILE\n!define APP_INSTALLER_STORE_FILE "scrylet-m4-acceptance\\installer.exe"\n!endif\n',
  );
  const profile = require("./migration-install-profile.cjs"),
    installers = {};
  for (const [kind, payload] of [
    ["old", old],
    ["new", options.next],
  ]) {
    const output = path.join(options.output, kind),
      config = profile.labConfig(output, include),
      file = path.join(options.output, kind + "-builder.json");
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
    run(process.execPath, [
      path.join(root, "node_modules/electron-builder/cli.js"),
      "--config",
      file,
      "--prepackaged",
      payload,
      "--win",
      "nsis",
      "--x64",
      "--publish",
      "never",
    ]);
    const names = fs
      .readdirSync(output)
      .filter((name) => name.endsWith("-Setup.exe"));
    if (names.length !== 1) throw Error("隔离安装器产物不唯一");
    installers[kind] = {
      file: path.relative(options.output, path.join(output, names[0])),
      sha256: hash(path.join(output, names[0])),
    };
  }
  if (
    hash(options.old) !== oldInstallerHash ||
    hash(path.join(options.next, "resources/app.asar")) !== newArchiveHash
  )
    throw Error("原始输入发生变化，构建未通过");
  const report = {
    status: "built",
    appId: require("../desktop/brand.cjs").APP_ID,
    guid: profile.LAB_GUID,
    originalOldInstaller: oldInstallerHash,
    oldArchive: hash(path.join(old, "resources/app.asar")),
    newArchive: newArchiveHash,
    installers,
    productionGuidUpgrade: "unverified; isolated acceptance namespace only",
  };
  fs.writeFileSync(
    path.join(options.output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  return report;
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { main, parse };
